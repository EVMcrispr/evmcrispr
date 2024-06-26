import { useRef } from "react";
import {
  Button,
  HStack,
  Icon,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  Tooltip,
  VStack,
  useDisclosure,
} from "@chakra-ui/react";

import SaveIcon from "../icons/SaveIcon";
import {
  getScriptSavedInLocalStorage,
  saveScriptToLocalStorage,
} from "../../utils";
import useToast from "../../hooks/useToast";

type SaveModalProps = {
  isOpen: boolean;
  onClose: () => void;
  saveFn: () => void;
  title: string;
  script: string;
};

const SaveModal = ({ isOpen, onClose, title, saveFn }: SaveModalProps) => {
  const initialRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    saveFn();
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      colorScheme={"yellow"}
      size={"lg"}
      initialFocusRef={initialRef}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Save Script</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack>
            <Icon as={SaveIcon} boxSize={16} color={"yellow.300"} />
            <Text align={"center"} color={"yellow.300"}>
              File &quot;{title}&quot; already exists. Do you want to override
              it?
            </Text>
            <HStack spacing={4}>
              <Button
                size={"md"}
                variant={"overlay"}
                colorScheme={"green"}
                onClick={handleSave}
                loadingText={"Saving script..."}
                tabIndex={0}
              >
                Confirm
              </Button>
              <Button
                size={"md"}
                variant={"overlay"}
                colorScheme={"pink"}
                onClick={onClose}
                tabIndex={1}
              >
                Cancel
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default function SaveScriptButton(props: {
  script: string;
  title: string;
}) {
  const {
    isOpen: isSaveModalOpen,
    onOpen: onSaveModalOpen,
    onClose: onSaveModalClose,
  } = useDisclosure({
    id: "save",
  });

  const toast = useToast();

  const save = () => {
    saveScriptToLocalStorage(props.title, props.script);
    toast({
      description: "Script saved on browser correctly",
      status: "success",
    });
  };

  const onSaveButtonClick = () => {
    if (getScriptSavedInLocalStorage(props.title)) {
      onSaveModalOpen();
    } else {
      save();
    }
  };

  return (
    <>
      <Tooltip
        label={props.title ? "Save script" : "The script needs a title first"}
        variant={props.title ? "" : "warning"}
        placement="top"
      >
        <IconButton
          icon={<Icon as={SaveIcon} />}
          aria-label={"Save script"}
          variant={"outline-overlay"}
          onClick={onSaveButtonClick}
          size={"md"}
          disabled={!props.title}
        />
      </Tooltip>
      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={onSaveModalClose}
        saveFn={save}
        {...props}
      />
    </>
  );
}
