import { Button } from '@chakra-ui/react';

type Props = {
  onClick?: () => void;
  children: React.ReactNode;
};

const BtnSuccess = ({ children, ...props }: Props) => {
  return (
    <Button
      size="lg"
      bgColor="brand.green"
      color="brand.btn.hover"
      _hover={{
        color: 'brand.green',
        bgColor: 'brand.btn.hover',
        transition: 'all 0.5s',
      }}
      padding="10px 20px"
      textDecoration="none"
      fontSize="24px"
      {...props}
    >
      {children}
    </Button>
  );
};

export default BtnSuccess;
