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

const status = (log: string) => {
  return log.startsWith(':success:')
    ? 'success'
    : log.startsWith(':error:')
    ? 'error'
    : 'info';
};

const stripString = (log: string): string => {
  return log.startsWith(':success:')
    ? log.slice(':success:'.length)
    : log.startsWith(':error:')
    ? log.slice(':error:'.length)
    : log;
};

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
    <Modal size="6xl" isOpen={isOpen} onClose={closeModal} isCentered>
      <ModalOverlay />
      <ModalContent>
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
              <Alert key={i} status={status(log)}>
                <AlertIcon />
                {stripString(log)}
              </Alert>
            ))}
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
