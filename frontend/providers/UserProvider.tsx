"use client";

import { MyUserContextProvider } from "@/hooks/useUser";

//the  userProvider has the child(props) that wrapped with userContext provider
// make sure to use this user provider inside the supabase provider
interface UserProviderProps {
  children: React.ReactNode;
}

const UserProvider: React.FC<UserProviderProps> = ({
  children
}) => {
  return ( 
    <MyUserContextProvider>
      {children}
    </MyUserContextProvider>
   );
}
 
export default UserProvider;