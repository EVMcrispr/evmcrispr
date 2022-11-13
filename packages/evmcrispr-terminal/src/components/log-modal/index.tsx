import {
  Alert,
  AlertIcon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Stack,
} from '@chakra-ui/react';

export default function LogModal({
  isOpen,
  closeModal,
  logs,
}: {
  isOpen: boolean;
  closeModal: () => void;
  logs: [string, boolean | undefined][];
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
          <Stack spacing={3}>
            {logs.map((log, i) => (
              <Alert
                key={i}
                status={
                  log[1] === true
                    ? 'success'
                    : log[1] === false
                    ? 'error'
                    : 'info'
                }
              >
                <AlertIcon />
                {log}
              </Alert>
            ))}
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
