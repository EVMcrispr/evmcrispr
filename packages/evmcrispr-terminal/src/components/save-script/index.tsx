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
} from '@chakra-ui/react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { useState } from 'react';

import SaveIcon from '../icons/save-icon';

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

const SaveModal = ({
  isOpen,
  onClose,
  link,
}: {
  isOpen: boolean;
  onClose: () => void;
  link?: string;
}) => {
  const [value, setValue] = useState<string>('');
  const [isSuccessful, setStatus] = useState<boolean>(false);

  function handleConfirm() {
    try {
      setStatus(true);
      localStorage.setItem(
        'savedScripts',
        JSON.stringify({
          title: value,
          date: new Date().toISOString(),
          link,
        }),
      );
    } catch (e) {
      console.log(e);
    }
  }

  function handleClose() {
    setStatus(false);
    setValue('');
    return onClose();
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
          {isSuccessful ? (
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
                  onClick={handleConfirm}
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

export default function SaveScriptButton() {
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
      />
      <SaveModal isOpen={isSaveModalOpen} onClose={onSaveModalClose} />
    </>
  );
}
