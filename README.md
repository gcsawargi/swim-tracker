# Swim Tracker

A small Next.js website for three friends sharing a 365-hour swimming pass.

## What it does

- Signs in with Firebase phone OTP.
- Shows a dashboard for three swimmers.
- Logs a timestamped pool entry with one button tap.
- Estimates pass usage from a fixed `1 hour per entry` rule.

## Firebase setup

1. Create a Firebase project.
2. Enable Authentication with the Phone provider.
3. Add your web app and copy the Firebase config values into `.env.local`.
4. Create a Firestore database.
5. Deploy the Firestore rules from `firestore.rules`.
6. Add three documents to the `members` collection.

## Environment variables

Add these keys to `.env.local`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## Members collection

Use each swimmer's exact E.164 phone number as the document ID, for example `+14155550123`.

Each member document should contain:

```json
{
  "name": "Alicia",
  "phoneNumber": "+14155550123",
  "accent": "#146c72"
}
```

## Development notes

- Firebase phone auth sends real SMS messages. Use Firebase test phone numbers while building.
- The current estimation rule lives in `src/lib/firestore.ts` as `HOURS_PER_ENTRY`.