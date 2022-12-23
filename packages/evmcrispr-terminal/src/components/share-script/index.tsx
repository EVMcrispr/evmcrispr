import { useParams } from 'react-router-dom';
import {
  Box,
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
  useDisclosure,
} from '@chakra-ui/react';
import { ShareIcon, Square2StackIcon } from '@heroicons/react/24/solid';

import { getRootLocation, getScriptSavedInLocalStorage } from '../../utils';

const ShareModal = ({
  isOpen,
  onClose,
  hashId,
  scriptTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  hashId?: string;
  scriptTitle?: string;
}) => {
  const root = getRootLocation(hashId);
  const link = root + '/' + hashId;

  function handleClick() {
    return navigator.clipboard.writeText(link);
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      isCentered
      colorScheme={'yellow'}
      size={{ base: 'sm', md: 'md', lg: 'xl' }}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Share script</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Icon as={ShareIcon} boxSize={24} color={'brand.green.300'} />
          <Text color={'brand.yellow.300'} fontWeight={700}>
            do you want to share this script?
          </Text>
          <Text color={'white'} fontSize={'4xl'}>
            {scriptTitle}
          </Text>
          <HStack w={'full'} maxW={'lg'}>
            <Box
              border={'1px solid'}
              borderColor={'brand.green.300'}
              bgColor={'gray'}
              px={4}
              py={{ base: 1.5, lg: 0.5 }}
              maxW={'calc(100% - 50px)'}
            >
              <Text color={'white'} noOfLines={1}>
                {link}
              </Text>
            </Box>
            <IconButton
              icon={<Icon as={Square2StackIcon} />}
              aria-label={'Copy link'}
              onClick={handleClick}
              variant={'outline'}
              size={'md'}
            />
          </HStack>
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
  const hashId = params?.hashId;

  const scriptSaved = getScriptSavedInLocalStorage(hashId);

  function handleShare() {
    onShareModalOpen();
  }

  return (
    <>
      <Tooltip
        label={
          !hashId || !scriptSaved
            ? 'Script must be saved before it is shared'
            : 'Share script'
        }
        placement="top"
      >
        <IconButton
          icon={<Icon as={ShareIcon} />}
          aria-label={'Share script'}
          variant={'outline'}
          onClick={handleShare}
          size={'md'}
          disabled={!hashId || !scriptSaved}
        />
      </Tooltip>
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={onShareModalClose}
        hashId={hashId}
        scriptTitle={scriptSaved?.title}
      />
    </>
  );
}
