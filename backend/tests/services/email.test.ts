import nodemailer from 'nodemailer';

jest.mock('nodemailer');

const mockSendMail = jest.fn();
const mockCreateTransport = nodemailer.createTransport as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
});

describe('sendEbookToReader', () => {
  it('sends an email with the file as attachment', async () => {
    mockSendMail.mockResolvedValueOnce({ messageId: 'abc' });

    const { sendEbookToReader } = await import('../../src/services/email');

    await sendEbookToReader(
      {
        smtpHost: 'smtp.example.com',
        smtpPort: 587,
        smtpUser: 'user@example.com',
        smtpPass: 'secret',
        senderEmail: 'user@example.com',
        readerEmail: 'my-kindle@kindle.com',
      },
      '/library/books/MyBook/book.epub',
    );

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'user@example.com', pass: 'secret' },
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'user@example.com',
        to: 'my-kindle@kindle.com',
        subject: 'book.epub',
        attachments: [{ filename: 'book.epub', path: '/library/books/MyBook/book.epub' }],
      }),
    );
  });

  it('throws when nodemailer rejects', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP auth failed'));

    const { sendEbookToReader } = await import('../../src/services/email');

    await expect(
      sendEbookToReader(
        {
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpUser: 'user',
          smtpPass: 'bad',
          senderEmail: 'from@example.com',
          readerEmail: 'kindle@kindle.com',
        },
        '/path/to/book.epub',
      ),
    ).rejects.toThrow('SMTP auth failed');
  });
});
