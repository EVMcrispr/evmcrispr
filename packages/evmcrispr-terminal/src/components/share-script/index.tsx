import { useParams } from 'react-router-dom';
import {
  Box,
  Icon as ChakraIcon,
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
  VStack,
  useDisclosure,
} from '@chakra-ui/react';
import { ShareIcon, Square2StackIcon } from '@heroicons/react/24/solid';

import getRootLocation from '../../utils/location';

const ShareModal = ({
  isOpen,
  onClose,
  url,
}: {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}) => {
  function handleClick() {
    return navigator.clipboard.writeText(url);
  }

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
                px={4}
                py={0.5}
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

export default function ShareButton() {
  const {
    isOpen: isShareModalOpen,
    onOpen: onShareModalOpen,
    onClose: onShareModalClose,
  } = useDisclosure({
    id: 'share',
  });

  const params = useParams();

  const root = getRootLocation(params?.hashId);
  const link = root + '/' + params?.hashId;

  async function handleShare() {
    onShareModalOpen();
  }

  return (
    <>
      <IconButton
        icon={<Icon as={ShareIcon} />}
        aria-label={'Share link'}
        variant={'outline'}
        onClick={handleShare}
        size={'md'}
        disabled={!params?.hashId}
      />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={onShareModalClose}
        url={link}
      />
    </>
  );
}
