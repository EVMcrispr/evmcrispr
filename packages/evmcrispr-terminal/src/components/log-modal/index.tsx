import {
  List,
  ListIcon,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from '@chakra-ui/react';

import { InfoIcon } from '@chakra-ui/icons';

export default function LogModal({
  isOpen,
  closeModal,
  logs,
}: {
  isOpen: boolean;
  closeModal: () => void;
  logs: string[];
}) {
  return (
    <Modal isOpen={isOpen} onClose={closeModal} isCentered>
      <ModalOverlay />
      <ModalContent w="300px">
        <ModalHeader color="white">Logs</ModalHeader>
        <ModalCloseButton
          _focus={{
            color: 'white',
            boxShadow: 'none',
          }}
        />
        <ModalBody paddingBottom="1.5rem" color="white">
          <List spacing={3}>
            {logs.map((log, i) => (
              <ListItem key={i}>
                <ListIcon as={InfoIcon} />
                {log}
              </ListItem>
            ))}
          </List>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
