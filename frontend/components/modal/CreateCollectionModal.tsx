"use client";

import React, { useState } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

import useCreateCollectionModal from "@/hooks/modals/useCreateCollectionModal";
import { useUser } from "@/hooks/useUser";

import Modal from "../ui/Modal";
import Input from "../misc/Input";
import Button from "../misc/Button";

const CreateCollectionModal = () => {
    const [isLoading, setIsLoading] = useState(false);

    const collectionModal = useCreateCollectionModal();
    const supabaseClient = useSupabaseClient();
    const { user } = useUser();
    const router = useRouter();

    const {
        register,
        handleSubmit,
        reset,
    } = useForm<FieldValues>({
        defaultValues: {
            name: "",
            description: "",
        }
    });

    const onChange = (open: boolean) => {
        if (!open) {
            reset();
            collectionModal.onClose();
        }
    };

    const onSubmit: SubmitHandler<FieldValues> = async (values) => {
        try {
            setIsLoading(true);

            if (!user) {
                toast.error("User not found");
                return;
            }

            const { error } = await supabaseClient
                .from("collections")
                .insert({
                    user_id: user.id,
                    name: values.name,
                    description: values.description,
                });

            if (error) throw error;

            router.refresh();
            toast.success("Collection created!");
            reset();
            collectionModal.onClose();
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
            title="Create a collection"
            description="Set a name and description"
            isOpen={collectionModal.isOpen}
            onChange={onChange}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-y-4">
                <Input
                    id="name"
                    disabled={isLoading}
                    {...register("name", { required: true })}
                    placeholder="Collection name"
                />
                <Input
                    id="description"
                    disabled={isLoading}
                    {...register("description", { required: true })}
                    placeholder="Short description"
                />
                <Button disabled={isLoading} type="submit">
                    Create Collection
                </Button>
            </form>
        </Modal>
    );
};

export default CreateCollectionModal;
