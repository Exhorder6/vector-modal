import { BrowserNode } from '@connext/vector-browser-node';
import React, { FC, useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  Grid,
  makeStyles,
  Divider,
  Button,
  Typography,
  Skeleton,
  TextField,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  InputAdornment,
  IconButton,
  Alert,
  Card,
  Chip,
  ThemeProvider,
  MenuItem,
  Popper,
  MenuList,
  ClickAwayListener,
  Paper,
  Grow,
} from '@material-ui/core';
import {
  MoreVert,
  FileCopy,
  Check,
  Close,
  DoubleArrow,
  CropFree,
} from '@material-ui/icons';
import Loading from './Loading';
// @ts-ignore
import QRCode from 'qrcode.react';
import { BigNumber, utils } from 'ethers';
import { EngineEvents } from '@connext/vector-types';
import { getRandomBytes32 } from '@connext/vector-utils';
import {
  theme,
  CHAIN_INFO_URL,
  routerPublicIdentifier,
  iframeSrc,
  TransferStates,
  ConnextModalProps,
  TRANSFER_STATES,
} from '../constants';
import {
  getExplorerLinkForTx,
  activePhase,
  getAssetBalance,
  hydrateProviders,
} from '../utils';
import '../styles/modal';
// @ts-ignore
import LoadingGif from '../assets/loading.gif';

const useStyles = makeStyles(() => ({
  root: {
    width: '100%',
  },
  spacing: {
    margin: theme.spacing(3, 2),
  },
  card: {
    height: 'auto',
    minWidth: '390px',
  },
}));

export const ConnextModal: FC<ConnextModalProps> = ({
  showModal,
  depositChainId,
  depositAssetId,
  withdrawChainId,
  withdrawAssetId,
  withdrawalAddress,
  onClose,
}) => {
  const classes = useStyles();
  const [initializing, setInitializing] = useState(true);
  const [depositAddress, setDepositAddress] = useState<string>();
  const [depositChainName, setDepositChainName] = useState<string>(
    depositChainId.toString()
  );
  const [withdrawChainName, setWithdrawChainName] = useState<string>(
    withdrawChainId.toString()
  );
  const [sentAmount, setSentAmount] = useState<string>('0.0');

  const [withdrawTx, setWithdrawTx] = useState<string>();
  const [crossChainTransfers, setCrossChainTransfers] = useState<{
    [crossChainTransferId: string]: TransferStates;
  }>({});
  const [initing, setIniting] = useState<boolean>(true);

  const [activeStep, setActiveStep] = React.useState(-1);

  const [
    activeCrossChainTransferId,
    setActiveCrossChainTransferId,
  ] = useState<string>('');

  const [error, setError] = useState<Error>();

  const registerEngineEventListeners = (node: BrowserNode): void => {
    node.on(EngineEvents.DEPOSIT_RECONCILED, (data) => {
      console.log(data);
      // if (data.meta.crossChainTransferId) {
      setCrossChainTransferWithErrorTimeout(
        activeCrossChainTransferId,
        TRANSFER_STATES.TRANSFERRING
      );
      // }
    });
    node.on(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, (data) => {
      if (
        data.transfer.meta.crossChainTransferId &&
        data.transfer.initiator === node.signerAddress
      ) {
        setCrossChainTransferWithErrorTimeout(
          data.transfer.meta.crossChainTransferId,
          TRANSFER_STATES.WITHDRAWING
        );

        setSentAmount(utils.formatEther(data.channelBalance.amount[1]));
      }
    });
    node.on(EngineEvents.WITHDRAWAL_RESOLVED, (data) => {
      if (
        data.transfer.meta.crossChainTransferId &&
        data.transfer.initiator === node.signerAddress
      ) {
        if (data.transfer.meta.crossChainTransferId) {
          setCrossChainTransferWithErrorTimeout(
            data.transfer.meta.crossChainTransferId,
            TRANSFER_STATES.COMPLETE
          );
        }
      }
    });
  };

  const setCrossChainTransferWithErrorTimeout = (
    crossChainTransferId: string,
    phase: TransferStates
  ) => {
    let tracked = { ...crossChainTransfers };
    tracked[crossChainTransferId] = phase;
    setCrossChainTransfers(tracked);
    setActiveStep(activePhase(phase));
    setTimeout(() => {
      if (crossChainTransfers[crossChainTransferId] !== phase) {
        return;
      }
      // Error if not updated
      let tracked = { ...crossChainTransfers };
      tracked[crossChainTransferId] = TRANSFER_STATES.ERROR;
      setCrossChainTransfers(tracked);
      setActiveStep(activePhase(phase));
      setError(new Error(`No updates within 30s for ${crossChainTransferId}`));
    }, 30_000);
  };

  const getChainInfo = async () => {
    try {
      const chainInfo: any[] = await utils.fetchJson(CHAIN_INFO_URL);
      const depositChainInfo = chainInfo.find(
        (info) => info.chainId === depositChainId
      );
      if (depositChainInfo) {
        setDepositChainName(depositChainInfo.name);
      }

      const withdrawChainInfo = chainInfo.find(
        (info) => info.chainId === withdrawChainId
      );
      if (withdrawChainInfo) {
        setWithdrawChainName(withdrawChainInfo.name);
      }
    } catch (e) {
      console.warn(`Could not fetch chain info from ${CHAIN_INFO_URL}`);
    }
  };

  useEffect(() => {
    setInitializing(false);
    const init = async () => {
      if (showModal) {
        await getChainInfo();
        const _ethProviders = hydrateProviders(depositChainId, withdrawChainId);
        const browserNode = new BrowserNode({
          routerPublicIdentifier,
          iframeSrc,
          supportedChains: [depositChainId, withdrawChainId],
        });
        try {
          await browserNode.init();
        } catch (e) {
          setIniting(false);
          setError(e);
          return;
        }
        registerEngineEventListeners(browserNode);
        console.log('INITIALIZED BROWSER NODE');
        const depositChannelRes = await browserNode.getStateChannelByParticipants(
          {
            chainId: depositChainId,
            counterparty: routerPublicIdentifier,
          }
        );
        if (depositChannelRes.isError) {
          setIniting(false);
          setError(depositChannelRes.getError());
          return;
        }
        const depositChannel = depositChannelRes.getValue();
        const _depositAddress = depositChannel.channelAddress;
        setDepositAddress(_depositAddress);

        const withdrawChannelRes = await browserNode.getStateChannelByParticipants(
          {
            chainId: withdrawChainId,
            counterparty: routerPublicIdentifier,
          }
        );
        if (withdrawChannelRes.isError) {
          setIniting(false);
          setError(withdrawChannelRes.getError());
          return;
        }

        let startingBalance: BigNumber;
        try {
          startingBalance = await getAssetBalance(
            _ethProviders,
            depositChainId,
            depositAssetId,
            _depositAddress
          );
        } catch (e) {
          setIniting(false);
          setError(e);
          return;
        }
        console.log(
          `Starting balance on ${depositChainId} for ${_depositAddress} of asset ${depositAssetId}: ${startingBalance.toString()}`
        );
        _ethProviders[depositChainId].on('block', async (blockNumber) => {
          console.log('New blockNumber: ', blockNumber);
          let updatedBalance: BigNumber;
          try {
            updatedBalance = await getAssetBalance(
              _ethProviders,
              depositChainId,
              depositAssetId,
              _depositAddress
            );
          } catch (e) {
            console.warn(`Error fetching balance: ${e.message}`);
            return;
          }
          console.log(
            `Updated balance on ${depositChainId} for ${_depositAddress} of asset ${depositAssetId}: ${updatedBalance.toString()}`
          );
          if (updatedBalance.gt(startingBalance)) {
            const transferAmount = updatedBalance.sub(startingBalance);
            const crossChainTransferId = getRandomBytes32();
            setActiveCrossChainTransferId(crossChainTransferId);
            const updated = { ...crossChainTransfers };
            updated[crossChainTransferId] = TRANSFER_STATES.DEPOSITING;
            setCrossChainTransfers(updated);
            setActiveStep(activePhase(TRANSFER_STATES.DEPOSITING));
            // TODO: no need to do this if tracking via transferID, but if
            // modal is only designed for one transfer, meh
            _ethProviders[depositChainId].off('block');
            browserNode
              .crossChainTransfer({
                amount: transferAmount.toString(),
                fromAssetId: depositAssetId,
                fromChainId: depositChainId,
                toAssetId: withdrawAssetId,
                toChainId: withdrawChainId,
                reconcileDeposit: true,
                withdrawalAddress,
                // meta: { crossChainTransferId },
              })
              .then((crossChainTransfer) => {
                console.log('crossChainTransfer: ', crossChainTransfer);
                setWithdrawTx(crossChainTransfer.withdrawalTx);
                const updated = { ...crossChainTransfers };
                updated[crossChainTransferId] = TRANSFER_STATES.COMPLETE;
                setActiveStep(activePhase(TRANSFER_STATES.COMPLETE));
                setCrossChainTransfers(updated);
              })
              .catch((e) => {
                setError(e);
                console.error('Error in crossChainTransfer: ', e);
                const updated = { ...crossChainTransfers };
                updated[crossChainTransferId] = TRANSFER_STATES.ERROR;
                setActiveStep(activePhase(TRANSFER_STATES.ERROR));
                setCrossChainTransfers(updated);
              });
          }
        });
        setIniting(false);
      }
    };
    init();
  }, [showModal]);
  const transferState: TransferStates =
    crossChainTransfers[activeCrossChainTransferId] ?? TRANSFER_STATES.INITIAL;

  const steps = ['Deposit', 'Transfer', 'Withdraw'];

  function getStepContent(step: number) {
    switch (step) {
      case 0:
        return `Detected deposit on-chain(${depositChainName}), depositing into state channel!`;
      case 1:
        return `Transferring from ${depositChainName} to ${withdrawChainName}`;
      case 2:
        return 'Withdrawing funds back on-chain(${withdrawChainName}!';
      default:
        return 'Unknown step';
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <Dialog open={showModal} fullWidth={true} maxWidth="xs">
        <Card className={classes.card}>
          <Grid
            id="Header"
            container
            direction="row"
            justifyContent="space-between"
            alignItems="center"
          >
            <Grid item>
              <IconButton
                aria-label="close"
                disabled={[
                  TRANSFER_STATES.DEPOSITING,
                  TRANSFER_STATES.TRANSFERRING,
                  TRANSFER_STATES.WITHDRAWING,
                ].includes(transferState as any)}
                onClick={onClose}
              >
                <Close />
              </IconButton>
            </Grid>
            <Grid item>
              <Typography gutterBottom variant="h6">
                Send USDC
              </Typography>
            </Grid>
            <Grid item>
              <Options />
            </Grid>
          </Grid>

          <div style={{ padding: '1rem' }}>
            {initing && (
              <Loading initializing={initializing} message={'Loading...'} />
            )}
            {depositAddress ? (
              <>
                <NetworkBar
                  depositChainName={depositChainName}
                  withdrawChainName={withdrawChainName}
                />
                <EthereumAddress depositAddress={depositAddress} />

                <Grid container spacing={2} className="pb-4">
                  <Grid item xs={12}>
                    <Stepper activeStep={activeStep} orientation="vertical">
                      {steps.map((label, index) => (
                        <Step key={label}>
                          <StepLabel>{label}</StepLabel>
                          <StepContent>
                            <Typography>{getStepContent(index)}</Typography>
                          </StepContent>
                        </Step>
                      ))}
                    </Stepper>
                  </Grid>
                </Grid>
                <Grid container spacing={2} className="pb-4">
                  <Grid item xs={12}>
                    <TextField
                      label="Receiver Address"
                      defaultValue={withdrawalAddress}
                      InputProps={{
                        readOnly: true,
                      }}
                      fullWidth
                    />
                  </Grid>
                </Grid>
              </>
            ) : (
              <>
                <Skeleton variant="rectangular" height={300} />
              </>
            )}
            {/* {!initing && transferState === TRANSFER_STATES.INITIAL && (
              <InitialState
                depositAddress={depositAddress}
                depositChainName={depositChainName}
                withdrawChainName={withdrawChainName}
                withdrawalAddress={withdrawalAddress}
                copiedDepositAddress={copiedDepositAddress}
                setCopiedDepositAddress={setCopiedDepositAddress}
              />
            )} */}
            {/* {!initing && transferState === TRANSFER_STATES.DEPOSITING && (
              <DepositingState depositChainName={depositChainName} />
            )}
            {!initing && transferState === TRANSFER_STATES.TRANSFERRING && (
              <TransferringState
                depositChainName={depositChainName}
                withdrawChainName={withdrawChainName}
              />
            )} 
            {!initing && transferState === TRANSFER_STATES.WITHDRAWING && (
              <WithdrawingState withdrawChainName={withdrawChainName} />
            )}*/}
            {!initing && transferState === TRANSFER_STATES.COMPLETE && (
              <CompleteState
                withdrawChainName={withdrawChainName}
                withdrawTx={withdrawTx!}
                sentAmount={sentAmount}
                withdrawChainId={withdrawChainId}
              />
            )}
            {!initing && transferState === TRANSFER_STATES.ERROR && (
              <ErrorState
                error={error ?? new Error('unknown')}
                crossChainTransferId={activeCrossChainTransferId}
              />
            )}
          </div>

          <Grid id="Footer" container direction="row" justifyContent="center">
            <Typography variant="body1">Powered By Connext</Typography>
          </Grid>
        </Card>
      </Dialog>
    </ThemeProvider>
  );
};

const Options: FC = () => {
  const [open, setOpen] = React.useState(false);
  const anchorRef = React.useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    setOpen((prevOpen) => !prevOpen);
  };

  const handleClose = (event: React.MouseEvent<EventTarget>) => {
    if (
      anchorRef.current &&
      anchorRef.current.contains(event.target as HTMLElement)
    ) {
      return;
    }

    setOpen(false);
  };

  function handleListKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Tab') {
      event.preventDefault();
      setOpen(false);
    }
  }

  // return focus to the button when we transitioned from !open -> open
  const prevOpen = React.useRef(open);
  React.useEffect(() => {
    if (prevOpen.current === true && open === false) {
      anchorRef.current!.focus();
    }

    prevOpen.current = open;
  }, [open]);
  return (
    <>
      <IconButton
        aria-label="options"
        ref={anchorRef}
        aria-controls={open ? 'menu-list-grow' : undefined}
        aria-haspopup="true"
        onClick={handleToggle}
      >
        <MoreVert />
      </IconButton>
      <Popper
        open={open}
        anchorEl={anchorRef.current}
        role={undefined}
        transition
        disablePortal
      >
        {({ TransitionProps, placement }) => (
          <Grow
            {...TransitionProps}
            style={{
              transformOrigin:
                placement === 'bottom' ? 'center top' : 'center bottom',
            }}
          >
            <Paper>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList
                  autoFocusItem={open}
                  id="menu-list-grow"
                  onKeyDown={handleListKeyDown}
                >
                  <MenuItem
                    id="link"
                    onClick={() =>
                      window.open(
                        'https://discord.com/channels/454734546869551114',
                        '_blank'
                      )
                    }
                  >
                    {/* <Chat /> */}
                    Discord
                  </MenuItem>
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
};

// const LoadingState: FC = () => (
//   <>
//     <Grid container spacing={2}>
//       <Grid item xs={12}>
//         <Loading initializing={initializing} message={'Loading...'} />
//       </Grid>
//     </Grid>
//   </>
// );
export interface EthereumAddressProps {
  depositAddress: string;
}

const EthereumAddress: FC<EthereumAddressProps> = (props) => {
  const { depositAddress } = props;
  const [copiedDepositAddress, setCopiedDepositAddress] = useState<boolean>(
    false
  );

  const [open, setOpen] = React.useState(false);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };
  return (
    <>
      <Grid container alignItems="flex-end" spacing={3} className="pb-4">
        <Grid item xs={12}>
          <TextField
            label="Deposit Address"
            defaultValue={depositAddress}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => {
                      console.log(`Copying: ${depositAddress}`);
                      navigator.clipboard.writeText(depositAddress);
                      setCopiedDepositAddress(true);
                      setTimeout(() => setCopiedDepositAddress(false), 5000);
                    }}
                    edge="end"
                  >
                    {!copiedDepositAddress ? <FileCopy /> : <Check />}
                  </IconButton>
                  <IconButton onClick={handleOpen} edge="end">
                    <CropFree />
                  </IconButton>
                </InputAdornment>
              ),
            }}
            fullWidth
          />
        </Grid>
        <QRCodeModal open={open} address={depositAddress} close={handleClose} />
      </Grid>
    </>
  );
};
export interface NetworkBarProps {
  depositChainName: string;
  withdrawChainName: string;
}

const NetworkBar: FC<NetworkBarProps> = (props) => {
  const { depositChainName, withdrawChainName } = props;

  return (
    <>
      <Grid
        id="network"
        container
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        className="pb-4"
      >
        <Grid item>
          <Chip color="secondary" label={depositChainName} />
        </Grid>
        <Grid item>
          <IconButton aria-label="arrow">
            <DoubleArrow />
          </IconButton>
        </Grid>
        <Grid item>
          <Chip color="primary" label={withdrawChainName} />
        </Grid>
      </Grid>
    </>
  );
};

export interface QRCodeProps {
  open: boolean;
  address: string;
  close: () => void;
}

const QRCodeModal: FC<QRCodeProps> = (props) => {
  // const classes = useStyles();
  const { open, close, address } = props;

  return (
    <Dialog onClose={close} aria-labelledby="simple-dialog-title" open={open}>
      <DialogTitle id="simple-dialog-title">
        Scan this code using your mobile wallet app
      </DialogTitle>
      <Grid
        id="qrcode"
        container
        direction="row"
        justifyContent="center"
        alignItems="flex-start"
        className="pb-4"
      >
        <QRCode value={address} />
      </Grid>
    </Dialog>
  );
};

const CompleteState: FC<{
  withdrawTx: string;
  withdrawChainName: string;
  withdrawChainId: number;
  sentAmount: string;
}> = ({ withdrawTx, withdrawChainName, sentAmount, withdrawChainId }) => (
  <>
    <Grid container spacing={2}>
      <Grid item xs={6}>
        <Typography gutterBottom variant="h6">
          Finished Sending To
        </Typography>
      </Grid>
      <Grid item xs={6}>
        <Chip color="primary" label={withdrawChainName} />
      </Grid>
    </Grid>
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <TextField
          label="Amount Sent"
          defaultValue={sentAmount}
          InputProps={{
            readOnly: true,
          }}
          fullWidth
        />
      </Grid>
    </Grid>
    <Grid container spacing={2}>
      <Grid item xs={6}>
        <Typography gutterBottom variant="h6">
          Withdrawal Tx
        </Typography>
      </Grid>
      <Grid item xs={6}>
        <Button
          variant="contained"
          href={getExplorerLinkForTx(withdrawChainId, withdrawTx)}
          target="_blank"
        >
          Link
        </Button>
      </Grid>
    </Grid>
  </>
);

const ErrorState: FC<{ error: Error; crossChainTransferId: string }> = ({
  error,
  crossChainTransferId,
}) => (
  <>
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography gutterBottom variant="h5">
          {`Error transferring ${crossChainTransferId.substring(0, 5)}... - ${
            error.message
          }`}
        </Typography>
      </Grid>
    </Grid>
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Divider variant="middle" />
      </Grid>
    </Grid>
  </>
);
