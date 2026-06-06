const noop = () => {};
const noopAsync = () => Promise.resolve();
const noopListener = () => ({ remove: noop });

module.exports = {
  initConnection: noopAsync,
  endConnection: noop,
  getSubscriptions: () => Promise.resolve([]),
  requestSubscription: noopAsync,
  getPurchaseHistory: () => Promise.resolve([]),
  finishTransaction: noopAsync,
  purchaseUpdatedListener: () => noopListener(),
  purchaseErrorListener: () => noopListener(),
  default: {},
};
