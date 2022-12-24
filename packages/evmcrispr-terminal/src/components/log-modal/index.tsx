import {
  Alert,
  AlertDescription,
  Box,
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
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { css } from '@emotion/react';

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
  const statusColor = hasError ? 'brand.warning.300' : 'brand.green.300';

  return (
    <Modal
      size="sm"
      isOpen={isOpen}
      onClose={closeModal}
      isCentered
      colorScheme={hasError ? 'warning' : 'green'}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Logs</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={10} w={'full'}>
            <Icon
              as={hasError ? XCircleIcon : CheckCircleIcon}
              color={statusColor}
              boxSize={20}
            />
            <VStack spacing={2} w={'full'}>
              {logs.map((log, i) => {
                return (
                  <Alert key={i} status={status(log)} borderColor={statusColor}>
                    <Icon
                      as={InformationCircleIcon}
                      boxSize={6}
                      color={'white'}
                    />
                    <AlertDescription>
                      <Box
                        css={css`
                          & .log-description {
                            color: var(--chakra-colors-white);
                            font-size: var(--chakra-fontSizes-2xl);
                            line-height: 0.375rem;
                          }
                        `}
                      >
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={ChakraUIRenderer()}
                          linkTarget="_blank"
                          className={'log-description'}
                        >
                          {stripString(log)}
                        </ReactMarkdown>
                      </Box>
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
