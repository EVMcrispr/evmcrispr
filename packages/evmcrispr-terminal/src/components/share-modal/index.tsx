import {
  Box,
  Icon as ChakraIcon,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from '@chakra-ui/react';
import { ShareIcon, Square2StackIcon } from '@heroicons/react/24/solid';

const ShareLinkModal = ({
  isOpen,
  onClose,
  url,
}: {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  isLoading: boolean;
}) => {
  function handleClick() {
    return navigator.clipboard.writeText(url);
  }
  console.log({ url });
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      colorScheme={'yellow'}
      size={'xl'}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Share script</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack>
            <ChakraIcon as={ShareIcon} boxSize={24} color={'brand.green.300'} />
            <Text color={'brand.yellow.300'} fontWeight={700}>
              do you want to share this script?
            </Text>
            <HStack>
              <Box
                border={'1px solid'}
                borderColor={'brand.green.300'}
                w={'lg'}
                bgColor={'gray'}
              >
                <Text color={'white'} maxWidth={'lg'} noOfLines={1}>
                  {url}
                </Text>
              </Box>
              <IconButton
                icon={<ChakraIcon as={Square2StackIcon} />}
                aria-label={'Copy link'}
                onClick={handleClick}
                variant={'outline'}
                size={'md'}
              />
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ShareLinkModal;
