import { Button, Dialog, IconButton, Tooltip } from "@repo/ui";
import { useState } from "react";
import { toast } from "sonner";
import {
  getScriptSavedInLocalStorage,
  saveScriptToLocalStorage,
} from "../../utils";
import SaveIcon from "../icons/SaveIcon";

type SaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  saveFn: () => void;
  title: string;
  script: string;
};

const SaveModal = ({ isOpen, onClose, title, saveFn }: SaveModalProps) => {
  async function handleSave() {
    saveFn();
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content size="md">
        <Dialog.Header>Save Script</Dialog.Header>
        <div className="flex flex-col items-center py-8 px-10 gap-4">
          <SaveIcon className="w-16 h-16 text-evm-yellow-300" />
          <p className="text-center text-evm-yellow-300 font-head">
            File &quot;{title}&quot; already exists. Do you want to override it?
          </p>
          <div className="flex gap-4">
            <Button variant="default" size="md" onClick={handleSave}>
              Confirm
            </Button>
            <Button
              variant="default"
              size="md"
              className="bg-evm-pink-400 text-evm-gray-900 border-evm-pink-400 hover:bg-evm-pink-300"
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog>
  );
};

export default function SaveScriptButton(props: {
  script: string;
  title: string;
}) {
  const [isSaveModalOpen, setSaveModalOpen] = useState(false);

  const save = () => {
    saveScriptToLocalStorage(props.title, props.script);
    toast.success("Script saved on browser correctly");
  };

  const onSaveButtonClick = () => {
    if (getScriptSavedInLocalStorage(props.title)) {
      setSaveModalOpen(true);
    } else {
      save();
    }
  };

  return (
    <>
      <Tooltip>
        <Tooltip.Trigger asChild>
          <IconButton
            aria-label="Save script"
            variant="outline"
            onClick={onSaveButtonClick}
            size="md"
            disabled={!props.title}
          >
            <SaveIcon className="w-5 h-5" />
          </IconButton>
        </Tooltip.Trigger>
        <Tooltip.Content
          variant={props.title ? "default" : "warning"}
          side="top"
        >
          {props.title ? "Save script" : "The script needs a title first"}
        </Tooltip.Content>
      </Tooltip>
      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        saveFn={save}
        {...props}
      />
    </>
  );
}
