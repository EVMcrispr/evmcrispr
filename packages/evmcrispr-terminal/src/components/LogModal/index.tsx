import {
  Alert,
  AlertDescription,
  Icon,
  Link,
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
  return (
    <Modal
      size="xl"
      isOpen={isOpen}
      onClose={closeModal}
      isCentered
      colorScheme={'yellow'}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Logs</ModalHeader>
        <ModalCloseButton />
        <ModalBody overflow="auto">
          <VStack spacing={10} w={'full'} height="100%">
            <VStack spacing={2} w={'full'} py="30px">
              {logs.map((log, i) => {
                const _status = status(log);
                const _statusColor =
                  _status == 'error'
                    ? 'orange.300'
                    : _status == 'success'
                    ? 'green.300'
                    : 'yellow.300';
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
                        components={ChakraUIRenderer({
                          a: ({ href, children, ...props }) => (
                            <Link
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              {...props}
                            >
                              {children}
                            </Link>
                          ),
                        })}
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
