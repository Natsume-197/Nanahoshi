import { Book } from "@/types";

//mport usePlayer from "./usePlayer";
//import useSubscribeModal from "./useSubscribeModal";
import useAuthModal from "./modals/useAuthModal";
import { useUser } from "./useUser";

// we gon use this hook in several places, so everytime the user click on play, the player will play with the song id
// we also create a play list of all the songs that user clicked, so if he clicked on the liked songs we will create a playlist, if click on the seearch or library(plays whatever songs in the lib) plays on the particular song 
const useOnPlay = (books: Book[]) => {
  //const player = usePlayer();
  //const subscribeModal = useSubscribeModal();
  const authModal = useAuthModal();
  const { subscription, user } = useUser();

  const onPlay = (id: string) => {
    if (!user) {
      return authModal.onOpen();
    }

    if (!subscription) {
      //return subscribeModal.onOpen();
    }

    //player.setId(id);
    //player.setIds(songs.map((song) => song.id));
  }

  return onPlay;
};

export default useOnPlay;

// lets use this in pageContext.ts/(site)/components