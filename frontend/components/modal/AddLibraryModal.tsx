"use client";

import React, { useState } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

import useAddLibraryModal from "@/hooks/modals/useAddLibraryModal";
import { useUser } from "@/hooks/useUser";

import Modal from "@/components/ui/Modal";
import Input from "@/components/misc/Input";
import Button from "@/components/misc/Button";

import { defineStepper } from "@/components/ui/stepper";
import { useMediaQuery } from "@/hooks/use-media-query";
const { Stepper } = defineStepper(
    {
        id: "step-1",
        title: "Create a Library",
    },
    {
        id: "step-2",
        title: "Select a Directory",
    }
);


const AddLibraryModal = () => {
    const [isLoading, setIsLoading] = useState(false);

    const collectionModal = useAddLibraryModal();
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
    const isMobile = useMediaQuery("(max-width: 768px)");

    return (
        <Modal
            title="test a collection"
            description="Set a name and description"
            isOpen={collectionModal.isOpen}
            onChange={onChange}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-y-4">

                <Stepper.Provider
                    className="space-y-4"
                    variant={isMobile ? "vertical" : "horizontal"}
                >
                    {({ methods }) => (
                        <React.Fragment>
                            <Stepper.Navigation>
                                {methods.all.map((step) => (
                                    <Stepper.Step
                                        key={step.id}
                                        of={step.id}
                                        onClick={() => methods.goTo(step.id)}

                                    >
                                        <Stepper.Title className="text-white">{step.title}</Stepper.Title>
                                        {isMobile &&
                                            methods.when(step.id, (step) => (
                                                <Stepper.Panel className="h-[200px] content-center rounded border p-8">
                                                    <p className="text-xl font-normal">
                                                        Content for {step.id}
                                                    </p>
                                                </Stepper.Panel>
                                            ))}
                                    </Stepper.Step>
                                ))}
                            </Stepper.Navigation>
                            {!isMobile &&
                                methods.switch({
                                    "step-1": (step) => <Content id={step.id} />,
                                    "step-2": (step) => <Content id={step.id} />
                                })}
                            <Stepper.Controls>
                                {!methods.isLast && (
                                    <Button
                                        onClick={methods.prev}
                                        disabled={methods.isFirst}
                                    >
                                        Previous
                                    </Button>
                                )}

                                {methods.isLast ? (
                                    <Button type="submit" disabled={isLoading}>
                                        Submit
                                    </Button>
                                ) : (
                                    <Button onClick={methods.next}>Next</Button>
                                )}

                            </Stepper.Controls>
                        </React.Fragment>
                    )}
                </Stepper.Provider>

            </form>
        </Modal>
    );
};

export default AddLibraryModal;


const Content = ({ id }: { id: string }) => {
    if (id === "step-1") {
        return (
            <Stepper.Panel className=" content-center  text-secondary-foreground p-8">
                <Input
                    className="mb-2"
                    id="name"
                    placeholder="test name"
                />
                <Input
                    id="description"
                    placeholder="test description"
                />
            </Stepper.Panel>
        );
    }

    if (id === "step-2") {
        return (
            <Stepper.Panel className="content-center  text-secondary-foreground p-8">
                <p className="text-xl text-white font-normal">Selecciona una carpeta</p>
            </Stepper.Panel>
        );
    }

    return null;
};
