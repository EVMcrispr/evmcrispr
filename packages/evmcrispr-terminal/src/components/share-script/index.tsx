import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  useToast,
} from '@chakra-ui/react';
import { ShareIcon, Square2StackIcon } from '@heroicons/react/24/solid';

import pinJSON from '../../api/pinata/pinJSON';

const ShareModal = ({
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

export default function ShareButton({
  script,
  savedScript,
}: {
  script: string;
  savedScript?: string;
}) {
  const [link, setLink] = useState('');
  const [isUploading, setUploadStatus] = useState(false);
  const {
    isOpen: isShareModalOpen,
    onOpen: onShareModalOpen,
    onClose: onShareModalClose,
  } = useDisclosure({
    id: 'share',
  });

  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  function getRootLocation() {
    const url = window.location.href;
    const urlArr = url.split('/');
    const urlWithoutHash = urlArr.filter((u) => u !== params.hashId);

    return urlWithoutHash.join('/');
  }

  async function handleShare() {
    try {
      const root = params?.hashId ? getRootLocation() : window.location.href;

      if (savedScript === script) {
        const url = root + '/' + params?.hashId;
        setLink(url);
        onShareModalOpen();
        return;
      }

      setUploadStatus(true);
      onShareModalOpen();

      const data = {
        text: script,
        date: new Date().toISOString(),
      };

      const { IpfsHash } = await pinJSON(data);
      const url = root + '/' + IpfsHash;

      setLink(url);
      setUploadStatus(false);

      return navigate(`/terminal/${IpfsHash}`, { replace: true });
    } catch (e: any) {
      setUploadStatus(false);
      onShareModalClose();
      toast({
        status: 'error',
        title: 'Error while trying to create sharable link',
        description: e.message,
        duration: 9000,
        isClosable: true,
      });
      console.log(e);
    }
  }

  return (
    <>
      <IconButton
        icon={<Icon as={ShareIcon} />}
        aria-label={'Share link'}
        variant={'outline'}
        onClick={handleShare}
        size={'md'}
      />
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={onShareModalClose}
        isLoading={isUploading}
        url={link}
      />
    </>
  );
}
