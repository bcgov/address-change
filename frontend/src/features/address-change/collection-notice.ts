/**
 * Collection notice shown before any personal information is gathered.
 * TODO: replace with the final wording approved by the program's privacy office.
 */
export const COLLECTION_NOTICE: { heading: string; body: string[] }[] = [
  {
    heading: 'Why we are collecting your information',
    body: [
      'The Province of British Columbia collects the personal information you provide in this service to update your address with the BC government services you choose.',
      'This includes your name, date of birth, email address, your current and new address, and, if you choose to update ICBC, your driver’s licence number, height, weight and security keyword.',
    ],
  },
  {
    heading: 'Legal authority',
    body: [
      'Your information is collected under section 26(c) of the Freedom of Information and Protection of Privacy Act (FOIPPA) because it relates directly to, and is necessary for, delivering this address change service.',
    ],
  },
  {
    heading: 'How your information is used and shared',
    body: [
      'We use your information to verify your identity and to send your new address to each service you select on the “Who needs to know?” step. Each selected service receives only the information it needs to update your record.',
      'Your information is stored securely in Canada and is retained only as long as needed to complete your request and meet record-keeping requirements.',
    ],
  },
  {
    heading: 'Questions',
    body: [
      'If you have questions about the collection of your personal information, contact the program’s privacy officer through the BC government contact page.',
    ],
  },
]
