
import AccountContent from "./components/AccountContent";

const Account = () => {
  return (
    <div 
      className="
        bg-neutral-900 
        rounded-lg 
        h-full 
        w-full 
        overflow-hidden 
        overflow-y-auto
      "
    >
      <div className="from-bg-neutral-900">
        <div className="flex flex-col gap-y-6 px-6 py-6 space-y-12">
          <h1 className="text-white text-3xl font-semibold">
            Account Settings
          </h1>
        </div>
      </div>
      <AccountContent />
    </div>
  )
}

export default Account;