import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Button,
  FormControl,
  HStack,
  Icon,
  IconButton,
  Input,
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
import { CheckCircleIcon } from '@heroicons/react/24/solid';

import SaveIcon from '../icons/save-icon';

import pinJSON from '../../api/pinata/pinJSON';
import getRootLocation from '../../utils/location';

function InputField({
  value,
  setValue,
}: {
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
}) {
  const handleChange = (event: any) => setValue(event.target.value);

  return (
    <FormControl isRequired w={'170px'}>
      <Input
        type="text"
        placeholder={'Add title'}
        value={value}
        onChange={handleChange}
        variant={'unstyled'}
        fontSize={'4xl'}
        color={'brand.gray.50'}
        _placeholder={{
          color: 'inherit',
        }}
      />
    </FormControl>
  );
}

function saveLinkToLocalStorage(title: string, link: string) {
  const scripts = localStorage.getItem('savedScripts');
  const newScript = {
    title,
    date: new Date().toISOString(),
    link,
  };

  if (scripts) {
    const parsedScripts = JSON.parse(scripts);
    const newScripts = [...parsedScripts, newScript];
    localStorage.setItem('savedScripts', JSON.stringify(newScripts));
  } else {
    localStorage.setItem(
      'savedScripts',
      JSON.stringify([
        {
          title,
          date: new Date().toISOString(),
          link,
        },
      ]),
    );
  }
}

const SaveModal = ({
  isOpen,
  onClose,
  script,
}: {
  isOpen: boolean;
  onClose: () => void;
  script: string;
}) => {
  const [value, setValue] = useState<string>('');
  const [status, setUploadStatus] = useState<
    'success' | 'error' | 'idle' | 'loading'
  >('idle');

  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  async function handleShare() {
    try {
      const root = params?.hashId ? getRootLocation() : window.location.href;
      setUploadStatus('loading');

      const data = {
        text: script,
        date: new Date().toISOString(),
      };

      const { IpfsHash } = await pinJSON(data);
      const url = root + '/' + IpfsHash;

      saveLinkToLocalStorage(value, url);
      setUploadStatus('success');

      return navigate(`/terminal/${IpfsHash}`, { replace: true });
    } catch (e: any) {
      setUploadStatus('error');
      onClose();

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

  function handleClose() {
    setValue('');
    setUploadStatus('idle');
    onClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      isCentered
      colorScheme={'yellow'}
      size={'lg'}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Save Script</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {status === 'success' ? (
            <>
              <VStack>
                <Icon
                  as={CheckCircleIcon}
                  boxSize={16}
                  color={'brand.green.300'}
                />
                <Text color={'brand.yellow.300'}>Saved succesfully</Text>
                <Text fontSize={'4xl'} color={'white'}>
                  {value}
                </Text>
              </VStack>
            </>
          ) : (
            <VStack>
              <Icon as={SaveIcon} boxSize={16} color={'brand.yellow.300'} />
              <Text color={'brand.yellow.300'}>
                Are you sure you want to save this script?
              </Text>
              <InputField value={value} setValue={setValue} />
              <HStack spacing={4}>
                <Button
                  size={'md'}
                  variant={'overlay'}
                  colorScheme={'green'}
                  onClick={handleShare}
                  isLoading={status === 'loading'}
                  loadingText={'Saving script...'}
                >
                  Confirm
                </Button>
                <Button
                  size={'md'}
                  variant={'overlay'}
                  colorScheme={'pink'}
                  onClick={onClose}
                >
                  Cancel
                </Button>
              </HStack>
            </VStack>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default function SaveScriptButton(props: {
  savedScript?: string;
  script: string;
}) {
  const {
    isOpen: isSaveModalOpen,
    onOpen: onSaveModalOpen,
    onClose: onSaveModalClose,
  } = useDisclosure({
    id: 'save',
  });

  return (
    <>
      <IconButton
        icon={<Icon as={SaveIcon} />}
        aria-label={'Save link'}
        variant={'outline'}
        onClick={onSaveModalOpen}
        size={'md'}
        disabled={props.savedScript === props.script}
      />
      <SaveModal
        isOpen={isSaveModalOpen}
        onClose={onSaveModalClose}
        {...props}
      />
    </>
  );
}