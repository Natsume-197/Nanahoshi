import useLoadFile from "@/hooks/useLoadFile";
import { FaDownload } from "react-icons/fa";

interface DownloadButtonProps {
  fileUrl: string;
}

const DownloadButton = ({ fileUrl }: DownloadButtonProps) => {

  const filePath = useLoadFile(fileUrl);

  const handleDownload = () => {
    if (!filePath) return;
    window.open(filePath, "_blank");
  };
  return ( 
    <button
      onClick={handleDownload}
      className="
        rounded-full 
        flex 
        items-center 
        justify-center 
        bg-green-500 
        p-2
        drop-shadow-md
        cursor-pointer
        w-20
      "
    >
      <FaDownload className="text-black" />
    </button>
   );
}
 

export default DownloadButton;