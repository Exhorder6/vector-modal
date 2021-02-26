import React, { FC } from 'react';
import { ModalContent, ModalBody, Text, Stack } from '@chakra-ui/react';
import { Header, Footer, NetworkBar } from '../static';
import { styleModalContent, CHAIN_DETAIL } from '../../constants';
import { lightGraphic } from '../../public';

export interface StatusProps {
  title: string;
  message: string;
  senderChainInfo: CHAIN_DETAIL;
  receiverChainInfo: CHAIN_DETAIL;
  receiverAddress: string;
  options: () => void;
}

const Status: FC<StatusProps> = props => {
  const {
    title,
    message,
    senderChainInfo,
    receiverChainInfo,
    receiverAddress,
    options,
  } = props;
  return (
    <>
      <ModalContent
        id="modalContent"
        className="global-style"
        style={{
          ...styleModalContent,
          backgroundImage: `url(${lightGraphic})`,
          backgroundPosition: 'right top',
        }}
      >
        <Header title={title} spinner={true} options={options} />
        <ModalBody>
          <Stack direction="column" spacing={7}>
            <Stack direction="column" spacing={2}>
              <Text fontSize="16px" casing="capitalize">
                {message}
              </Text>
              <Text
                fontSize="14px"
                casing="capitalize"
                color="#666666"
              >
                Do not close or refresh.
              </Text>
            </Stack>

            <NetworkBar
              senderChainInfo={senderChainInfo}
              receiverChainInfo={receiverChainInfo}
              receiverAddress={receiverAddress}
            />
          </Stack>
        </ModalBody>
        <Footer />
      </ModalContent>
    </>
  );
};

export default Status;
