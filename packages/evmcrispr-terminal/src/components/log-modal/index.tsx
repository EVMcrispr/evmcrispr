import {
  Alert,
  AlertDescription,
  Icon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  VStack,
} from '@chakra-ui/react';

import ReactMarkdown from 'react-markdown';
import ChakraUIRenderer from 'chakra-ui-markdown-renderer';
import remarkGfm from 'remark-gfm';
import {
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';

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
  const hasError = logs.find((log) => log.startsWith(':error:'));
  const hasSuccess = logs.find((log) => log.startsWith(':success:'));
  const statusColor = hasError
    ? 'brand.warning.300'
    : hasSuccess
    ? 'brand.green.300'
    : 'brand.yellow.300';

  return (
    <Modal
      size="xl"
      isOpen={isOpen}
      onClose={closeModal}
      isCentered
      colorScheme={hasError ? 'warning' : hasSuccess ? 'green' : 'yellow'}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Logs</ModalHeader>
        <ModalCloseButton />
        <ModalBody overflow="scroll">
          <VStack spacing={10} w={'full'} height="100%">
            <Icon
              as={
                hasError
                  ? XCircleIcon
                  : hasSuccess
                  ? CheckCircleIcon
                  : InformationCircleIcon
              }
              color={statusColor}
              boxSize={20}
              mt={10}
            />
            <VStack spacing={2} w={'full'} pb="20px">
              {logs.map((log, i) => {
                const _status = status(log);
                const _statusColor =
                  _status == 'error'
                    ? 'brand.warning.300'
                    : _status == 'success'
                    ? 'brand.green.300'
                    : 'brand.yellow.300';
                return (
                  <Alert key={i} status={_status} borderColor={_statusColor}>
                    <Icon
                      as={
                        _status == 'error'
                          ? XCircleIcon
                          : _status == 'success'
                          ? CheckCircleIcon
                          : InformationCircleIcon
                      }
                      boxSize={6}
                      color={_statusColor}
                    />
                    <AlertDescription>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={ChakraUIRenderer()}
                        linkTarget="_blank"
                      >
                        {stripString(log)}
                      </ReactMarkdown>
                    </AlertDescription>
                  </Alert>
                );
              })}
            </VStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
