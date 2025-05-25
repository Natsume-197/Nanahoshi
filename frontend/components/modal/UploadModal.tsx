"use client";

import uniqid from "uniqid";
import React, { useState, useCallback } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";
import JSZip from "jszip";

import useUploadModal from "@/hooks/modals/useUploadModal";
import { useUser } from "@/hooks/useUser";

import Modal from "@/components/ui/Modal";
import Input from "@/components/misc/Input";
import Select from "@/components/misc/Select";
import Button from "@/components/misc/Button";
import Image from "next/image";

const UploadModal = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [epubFile, setEpubFile] = useState<File | null>(null);

    const uploadModal = useUploadModal();
    const supabaseClient = useSupabaseClient();
    const { user } = useUser();
    const router = useRouter();

    const {
        register,
        handleSubmit,
        reset,
        watch,
        setValue,
        trigger,
    } = useForm<FieldValues>({
        defaultValues: {
            author: "",
            title: "",
            file: null,
            image: null,
            type: "book"
        }
    });

    const type = watch("type");

    const extractCoverFromEpub = useCallback(async (file: File) => {
        try {
            const zip = await JSZip.loadAsync(file);
            const domparser = new DOMParser();

            // 1. Buscar container.xml
            const containerFile = zip.file(/^META-INF\/container.xml$/i)[0];
            if (!containerFile) throw new Error("EPUB inválido: Falta container.xml");

            const containerContent = await containerFile.async("text");
            const containerDoc = domparser.parseFromString(containerContent, "text/xml");

            // 2. Obtener ruta del OPF
            const rootfilepath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
            if (!rootfilepath) throw new Error("No se encontró el archivo OPF");

            // 3. Cargar contenido OPF
            const opfFile = zip.file(rootfilepath);
            if (!opfFile) throw new Error("Archivo OPF no encontrado");
            const opfContent = await opfFile.async("text");
            const opfDoc = domparser.parseFromString(opfContent, "application/xhtml+xml");

            // 4. Búsqueda específica de portada como en EpubBook
            let coverImage = opfDoc.querySelector('item[properties="cover-image"]');

            // Fallback 1: Primer JPEG
            if (!coverImage) {
                coverImage = opfDoc.querySelector('item[media-type="image/jpeg"]');
            }

            // Fallback 2: Cualquier imagen
            if (!coverImage) {
                coverImage = opfDoc.querySelector('item[media-type^="image/"]');
            }

            if (!coverImage) throw new Error("No se encontró imagen de portada en el EPUB");

            // 5. Resolver ruta como en EpubBook
            const rootDirectory = rootfilepath.split("/").slice(0, -1).join("/");
            const coverPath = coverImage.getAttribute("href");
            const absoluteCoverPath = `${rootDirectory}/${coverPath}`.replace(/\/+/g, "/");

            // 6. Obtener archivo de imagen
            const coverFileEntry = zip.file(absoluteCoverPath);
            if (!coverFileEntry) throw new Error("Archivo de portada no encontrado");

            // 7. Tipo MIME desde el item o fallback a JPEG
            const mediaType = coverImage.getAttribute("media-type") || "image/jpeg";

            // 8. Crear preview y actualizar formulario
            const coverBlob = await coverFileEntry.async("blob");
            const coverUrl = URL.createObjectURL(new Blob([coverBlob], { type: mediaType }));

            setCoverPreview(coverUrl);
            setValue("image", [new File([coverBlob], "cover", { type: mediaType })]);
            trigger("image");

            // Limpiar recursos como en EpubBook
            zip.remove(containerFile.name);
            zip.remove(rootfilepath);

        } catch (error) {
            console.error("Error en extracción de portada:", {
                error
            });

            toast.error("No se pudo extraer la portada. Sube una imagen manualmente.");
        }
    }, [setValue, trigger]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const file = e.target.files[0];
            setEpubFile(file);

            if (type === "book" && file.name.endsWith(".epub")) {
                await extractCoverFromEpub(file);
            } else {
                setCoverPreview(null);
                setValue("image", null);
            }
        }
    };

    const onChange = (open: boolean) => {
        if (!open) {
            reset();
            setCoverPreview(null);
            setEpubFile(null);
            uploadModal.onClose();
        }
    };

    const onSubmit: SubmitHandler<FieldValues> = async (values) => {
        try {
            setIsLoading(true);
            const imageFile = values.image?.[0];
            const contentFile = values.file?.[0];

            if ((!imageFile || !contentFile || !user)) {
                toast.error("Missing fields");
                return;
            }

            const uniqueID = uniqid();
            const storageBucket = values.type === "audiobook" ? "audiobooks" : "books";

            // 1. Subir el archivo principal (archivo EPUB, PDF o MP3)
            const { data: contentData, error: contentError } = await supabaseClient
                .storage
                .from(storageBucket)
                .upload(`${uniqueID}`, contentFile, {
                    cacheControl: "3600",
                    upsert: false,
                });
            if (contentError) throw new Error("Error uploading file");

            // Subir imagen
            const { data: imageData, error: imageError } = await supabaseClient
                .storage
                .from("covers")
                .upload(`cover-${uniqueID}`, imageFile, {
                    cacheControl: "3600",
                    upsert: false,
                });
            if (imageError) throw new Error("Error uploading image");

            // Crear registro en base de datos
            const { data: bookInsertData, error: bookInsertError } = await supabaseClient
                .from("books")
                .insert({
                    user_id: user.id,
                    original_title: values.title,
                    original_desc: values.author, // si usas otra columna para el autor, cámbialo
                    cover_path: imageData.path,
                    // isbn, published_date u otros campos pueden agregarse si los tienes en el formulario
                })
                .select(); // para obtener el registro insertado

            if (bookInsertError) throw new Error(`Error insertando en books: ${bookInsertError.message}`);

            const newBook = bookInsertData[0];

            // 4. Determinar el tipo de formato para la inserción en "book_format"
            // Si es audiolibro, el formato es "audiobook"
            // Si es libro, determinamos si es epub o pdf según la extensión del archivo
            const fileName = contentFile.name.toLowerCase();
            let formatType = "";
            if (values.type === "audiobook") {
                formatType = "audiobook";
            } else {
                if (fileName.endsWith(".epub")) {
                    formatType = "epub";
                } else if (fileName.endsWith(".pdf")) {
                    formatType = "pdf";
                } else {
                    formatType = "unknown";
                }
            }

            // 5. Insertar registro en "book_format"
            const { error: formatError } = await supabaseClient
                .from("book_format")
                .insert({
                    book_id: newBook.id,
                    format_type: formatType,
                    file_path: contentData.path,
                    file_size: contentFile.size,
                });

            if (formatError) throw new Error(`Error insertando en book_format: ${formatError.message}`);

            router.refresh();
            toast.success("Upload successful!");
            reset();
            setCoverPreview(null);
            uploadModal.onClose();
        } catch (error) {
            if (error instanceof Error) {
                toast.error(error.message || "Something went wrong");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal
            title="Upload a book or audiobook"
            description="Upload a file and cover image"
            isOpen={uploadModal.isOpen}
            onChange={onChange}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-y-4">
                <Select
                    disabled={isLoading}
                    {...register("type", { required: true })}
                    options={[
                        { label: "Book", value: "book" },
                        { label: "Audiobook", value: "audiobook" },
                    ]}
                />
                <Input
                    id="title"
                    disabled={isLoading}
                    {...register("title", { required: true })}
                    placeholder="Title"
                />
                <Input
                    id="author"
                    disabled={isLoading}
                    {...register("author", { required: true })}
                    placeholder="Author"
                />
                <div>
                    <div className="pb-1">
                        Select a {type === "audiobook" ? "MP3" : "PDF or EPUB"} file
                    </div>
                    <Input
                        disabled={isLoading}
                        type="file"
                        accept={type === "audiobook" ? ".mp3" : ".pdf,.epub"}
                        id="file"
                        {...register("file", {
                            required: true,
                            onChange: handleFileChange
                        })}
                    />
                </div>

                {coverPreview && (
                    <div className="mt-2">
                        <p className="text-sm text-neutral-400">Extracted cover:</p>
                        <Image
                            src={coverPreview}
                            alt="Cover preview"
                            className="w-32 h-32 object-cover rounded-md mt-1"
                        />
                    </div>
                )}

                <div>
                    <div className="pb-1">
                        {type === "book" ? "Select or edit cover image" : "Select cover image"}
                    </div>
                    <Input
                        disabled={isLoading}
                        type="file"
                        accept="image/*"
                        id="image"
                        {...register("image", {
                            required: !(type === "book" && epubFile),
                            onChange: (e) => {
                                if (e.target.files?.[0]) {
                                    setCoverPreview(URL.createObjectURL(e.target.files[0]));
                                }
                            }
                        })}
                    />
                </div>

                <Button disabled={isLoading} type="submit">
                    Upload
                </Button>
            </form>
        </Modal>
    );
};

export default UploadModal;