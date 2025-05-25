"use client";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { BiLike, BiServer } from "react-icons/bi";
import Box from "@/components/ui/Box";
import SidebarItem from "@/components/layout/sidebar/SidebarItem";
import Library from "@/components/misc/Library";
import { IoCompassOutline } from "react-icons/io5";
import { BookWithFormats, Collection } from "@/types";

interface SiderbarProps {
    children: React.ReactNode;
    books: BookWithFormats[];
    collections: Collection[];
}

const Sidebar: React.FC<SiderbarProps> = ({
    children, books, collections }) => {
    const pathname = usePathname();
    const routes = useMemo(() => [
    {   
        icon: IoCompassOutline  ,
        label: 'Explore',
        active: pathname === '/explore',
        href: '/explore'
    },
    {   
        icon: BiLike,
        label: 'Liked books',
        active: pathname === '/liked',
        href: '/server'
    },
    {   
        icon: BiServer,
        label: 'My Uploads',
        active: pathname === '/server',
        href: '/server'
    }
    /*
    {   
        icon: IoStatsChart,
        label: 'Stats',
        active: pathname === '/stats',
        href: '/stats'
    }
    */
    ], [pathname])
    return (
        <div className="flex h-full">
            <div className="hidden md:flex flex-col gap-y-2 bg-black h-full w-[300px] px-2">
                <Box>
                    <div className="flex flex-col gap-y-4 px-5 py-4">
                        {routes.map((item) =>(
                            <SidebarItem key={item.label} {...item} />
                        ))}
                    </div>
                </Box>
                <Box className="overflow-y-auto h-full">
                    <Library books={books} collections={collections}/>
                </Box>
            </div>
            <main className="h-full flex-1 overflow-y-auto ">
                {children}
            </main>
        </div>
    );
}

export default Sidebar;