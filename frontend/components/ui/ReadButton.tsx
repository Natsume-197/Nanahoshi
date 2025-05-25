import { BookAIcon, BookDown, BookIcon, BookMarked, BookOpenCheck, BookType, BookUser } from "lucide-react";
import { CgRead } from "react-icons/cg";
import { CiRead } from "react-icons/ci";
import { FaPlay } from "react-icons/fa";
import { LiaFunnelDollarSolid } from "react-icons/lia";
import { LuExpand } from "react-icons/lu";
import { PiBookBookmark } from "react-icons/pi";

const PlayButton = () => {
  return ( 
    <button
      className="
        transition 
        opacity-0 
        rounded-full 
        flex 
        items-center 
        justify-center 
        bg-green-500 
        p-4 
        drop-shadow-md 
        translate
        translate-y-1/4
        group-hover:opacity-100 
        group-hover:translate-y-0
        hover:scale-110
        cursor-pointer
      "
    >
      <LuExpand className="text-black" />
    </button>
   );
}
 
export default PlayButton;