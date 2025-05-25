"use client"

import { useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";
import Button from "@/components/misc/Button";
import useAuthModal from "@/hooks/modals/useAuthModal";
import { useSupabaseClient } from "@supabase/auth-helpers-react";
import { useUser } from "@/hooks/useUser";
import toast from "react-hot-toast";
import { useCurrentUserImage } from '@/hooks/use-current-user-image'
import { useCurrentUserName } from '@/hooks/use-current-user-name'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useState } from "react";
import SearchInput from "@/components/search/SearchInput";
import Link from "next/link";
import { BiHome } from "react-icons/bi";

interface HeaderProps {
  className?: string
}

const Header: React.FC<HeaderProps> = ({
  className
}) => {
  const router = useRouter();
  const authModal = useAuthModal();

  const supabaseClient = useSupabaseClient();
  const { user } = useUser();

  const profileImage = useCurrentUserImage()
  const name = useCurrentUserName()
  const initials = name
    ?.split(' ')
    ?.map((word) => word[0])
    ?.join('')
    ?.toUpperCase()

  const handleLogout = async () => {
    const { error } = await supabaseClient.auth.signOut();
    // TODO Reset any reads
    router.refresh();

    if (error) {
      console.log(error);
      toast.error(error.message)
    } else {
      toast.success("Logged Out!")
    }
  }

  return (
    <div className={twMerge("h-fit px-6 py-2.5", className)}>
      <div className="w-full flex items-center justify-between">

        <div className="absolute left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4">
          <div className="flex items-center gap-x-2">
            <Link href="/">
              <Button
                className="bg-neutral-800 cursor-pointer text-white hover:bg-neutral-700 transition rounded-full"
              >
                <BiHome size={22} />
              </Button>
            </Link>

            <div className="flex-1">
              <SearchInput />
            </div>
          </div>
        </div>

        {/* Bloque de usuario a la derecha */}
        <div className="ml-auto flex items-center gap-x-4 relative z-10">
          {user ? (
            <>
              <Button
                onClick={handleLogout}
                className="bg-white px-6 cursor-pointer py-2"
              >
                Logout
              </Button>
              <button
                className="cursor-pointer"
                onClick={() => router.push('/account')}
              >
                <Avatar>
                  {profileImage && <AvatarImage src={profileImage} alt={initials} />}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </button>
            </>
          ) : (
            <>
              <Button
                onClick={authModal.onOpen}
                className="bg-transparent text-neutral-300 font-medium"
              >
                Sign up
              </Button>
              <Button
                onClick={authModal.onOpen}
                className="bg-white px-6 py-2"
              >
                Log in
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
export default Header;