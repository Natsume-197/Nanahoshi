import { Figtree } from 'next/font/google'
import ToasterProvider from '@/providers/ToasterProvider'
import UserProvider from '@/providers/UserProvider'
import ModalProvider from '@/providers/ModalProvider'
import SupabaseProvider from '@/providers/SupabaseProvider'
//import Player from '@/components/Player'
import '../../globals.css'
import Header from '@/components/layout/Header'

const font = Figtree({ subsets: ['latin'] })

export const revalidate = 0; //we don't want this layout to cache 

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {

  return (
    <html lang="en">
      <body className={font.className}>
        <ToasterProvider />
        <SupabaseProvider>
          <UserProvider>
            <ModalProvider />
              {children}
          </UserProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
