"use client";

import React, { useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { useRouter } from "next/navigation";

import { LoginForm } from "./login-form";
import useAuthModal from "@/hooks/modals/useAuthModal";

import Modal from "./Modal";

const AuthModal = () => {
  const router = useRouter();
  const { onClose, isOpen } = useAuthModal();


  // to close the modal, once the login is done.
  /*
  useEffect(() => {
    if (session) {
      router.refresh();
      onClose();
    }
  }, [session, router, onClose]);

  const onChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };
  */
  return (
      <div></div>
  );
};

export default AuthModal;