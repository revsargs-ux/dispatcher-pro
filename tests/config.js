module.exports = {
  baseUrl: 'http://localhost:3000',
  pages: {
    dispatcher: '/',
    worker: '/worker.html',
    client: '/client.html',
    owner: '/owner.html'
  },
  accounts: {
    worker: { phone: '+79001234567', pass: 'Test1234', table: 'workers', name: 'Test Worker' },
    client: { phone: '+79001234568', pass: 'Test1234', table: 'clients', name: 'Test Client' },
    dispatcher: { phone: '+79001234569', pass: 'Test1234', table: 'users', name: 'Test Dispatcher', role: 'dispatcher' },
    owner: { phone: '+79248910259', pass: '1234', table: 'users', name: 'Owner', role: 'owner' }
  },
  thresholds: {
    pageLoadMs: 3000,
    buttonMinHeight: 44,
    maxConsoleErrors: 0,
    maxNetworkRequests: 20,
    maxDomNodes: 5000
  },
  viewports: {
    mobile: { width: 375, height: 812, name: 'iPhone X' },
    tablet: { width: 768, height: 1024, name: 'iPad' },
    desktop: { width: 1280, height: 720, name: 'Desktop' }
  },
  timeouts: {
    pageLoad: 15000,
    elementVisible: 5000,
    testTimeout: 30000,
    apiResponse: 10000
  },
  NODE_PATH: '/home/n8n/.npm-global/lib/node_modules',
  screenshotDir: '/tmp/e2e-screenshots',
  snapshotDir: __dirname + '/snapshots',
  reportFile: __dirname + '/report.json',
  reportMd: __dirname + '/report.md'
};
