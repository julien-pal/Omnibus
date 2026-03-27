import crypto from 'crypto';
import { ConfigMap } from '../types';

const defaults: ConfigMap = {
  app: {
    port: 8686,
    auth: {
      enabled: false,
      username: '',
      passwordHash: ''
    },
    renamePatterns: {
      ebook: '{author}/{series}/{title}',
      audiobook: '{author}/{series}/{title}'
    },
    wishlistCron: {
      enabled: true,
      intervalMinutes: 60
    },
    libraryCacheRebuild: {
      enabled: true,
      intervalMinutes: 10
    },
    followCron: {
      enabled: false,
      intervalMinutes: 60
    },
    emailConfig: {
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      senderEmail: '',
      readerEmail: '',
    },
    syncEnabled: true,
    jwtSecret: crypto.randomBytes(32).toString('hex')
  },
  prowlarr: {
    url: '',
    apiKey: '',
    indexers: []
  },
  clients: {
    active: '',
    clients: []
  },
  libraries: {
    ebook: [],
    audiobook: [],
    mixed: []
  },
  follows: {
    authors: [],
    series: []
  }
};

export default defaults;
