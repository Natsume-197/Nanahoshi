import { Figtree } from 'next/font/google'
import getBooksByUserId from '@/actions/getBooksByUserId'
//import getActiveProductsWithPrices from '@/actions/getActiveProductsWithPrices'
import Sidebar from '@/components/layout/sidebar/Sidebar'
import ToasterProvider from '@/providers/ToasterProvider'
import UserProvider from '@/providers/UserProvider'
import ModalProvider from '@/providers/ModalProvider'
import SupabaseProvider from '@/providers/SupabaseProvider'
//import Player from '@/components/Player'
import '../globals.css'
import getCollectionsByUserId from '@/actions/getCollectionsByUserId'
import Header from '@/components/layout/Header'

const font = Figtree({ subsets: ['latin'] })

export const revalidate = 0; //we don't want this layout to cache 

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  //const products = await getActiveProductsWithPrices();
  const [userBooks, userCollections] = await Promise.all([
    getBooksByUserId(),
    getCollectionsByUserId(),
  ]);

  return (
    <html lang="en">
      <body className={font.className}>
        <ToasterProvider />
        <SupabaseProvider>
          <UserProvider>
            <ModalProvider />
            <div className="flex flex-col h-screen">
              <Header />
              <div className="flex flex-1 overflow-hidden">
                <div className="overflow-y-auto bg-neutral-950">
                  <Sidebar books={userBooks} collections={userCollections} />
                </div>
                <main className="flex-1 overflow-y-auto">
                  {children}
                </main>
              </div>
            </div>
          </UserProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
