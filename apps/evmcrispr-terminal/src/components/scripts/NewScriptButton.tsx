import { IconButton, Row } from "@repo/ui";
import { Plus } from "@repo/ui/icons";
import { useNavigate } from "react-router";

export default function NewScriptButton({
  showLabel = false,
  onCreated,
}: {
  showLabel?: boolean;
  onCreated?: () => void;
} = {}) {
  const navigate = useNavigate();

  // The route makes, or reuses, the placeholder space.
  function handleClick() {
    navigate("/");
    onCreated?.();
  }

  // A line of a menu.
  if (showLabel) {
    return (
      <Row
        leading={<Plus aria-hidden className="size-4" />}
        title="New script"
        onClick={handleClick}
      />
    );
  }

  return (
    <IconButton
      aria-label="New script"
      variant="ghost"
      onClick={handleClick}
      size="md"
    >
      <Plus aria-hidden className="size-5" />
    </IconButton>
  );
}
