import { toast } from "sonner";

// Thin wrapper for backward compatibility.
// Callers that used: const toast = useToast(); toast({ description, status })
// can now use: import { toast } from "sonner"; toast.success(description)
//
// This hook returns a function with the old Chakra-style API so that any
// remaining callers keep working during the migration.
export default function useToast() {
  return ({ description, status }: { description: string; status: string }) => {
    switch (status) {
      case "success":
        toast.success(description);
        break;
      case "error":
        toast.error(description);
        break;
      case "warning":
        toast.warning(description);
        break;
      default:
        toast.info(description);
        break;
    }
  };
}
