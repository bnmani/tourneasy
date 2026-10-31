import type { HelpGuide, HelpGuideKey } from './types';

export const en: Record<HelpGuideKey, HelpGuide> = {
  players: {
    title: 'Player guide',
    summary: 'Create an account, enter tournaments, pay, and follow your matches.',
    intro:
      'Tourneasy lets you find badminton tournaments, enter singles, doubles or mixed, pay online and follow your matches on the day. This guide follows that order, from creating your account to collecting your lunch.',
    facts: [
      { title: 'What you need', text: 'An email address and a phone number.' },
      {
        title: 'How you pay',
        text: 'Online with iDEAL, or at the desk if the organiser allows it.',
      },
      { title: 'On your phone', text: 'Every page works in your phone’s browser.' },
    ],
    sections: [
      {
        id: 'account',
        title: 'Create your account',
        blocks: [
          {
            p: 'Click **Sign up** at the top of any page and fill in your details. Your date of birth and gender decide which events you can play, so check them. Then confirm your email address with the link we send you.',
          },
          {
            p: 'You get a member number such as **TE100006**. Partners can use it to invite you for doubles, and you can log in with it instead of your email.',
          },
          {
            img: {
              src: 'p-register',
              alt: 'Create account form with personal details',
              caption:
                'Create account. Players under 16 need permission from a parent or guardian, which the form asks for.',
            },
          },
        ],
      },
      {
        id: 'find',
        title: 'Find a tournament',
        blocks: [
          {
            p: 'Open **Tournaments** and choose **Upcoming**, **Entries open** or **Past**. Search by name, town or venue, or filter by province and event. Each card shows the date, venue, events and the fee range. The **Calendar** shows the same tournaments by month.',
          },
          {
            img: {
              src: 'p-tournaments',
              alt: 'Tournament list with search, filters and tournament cards',
              caption:
                'Tournaments. HE and DE are men’s and women’s singles, HD and DD doubles, GD mixed.',
            },
          },
        ],
      },
      {
        id: 'tournament-page',
        title: 'Read the tournament page',
        blocks: [
          { p: 'The tournament page has everything you need before you enter:' },
          {
            ul: [
              '**Events** with their format and entry fee',
              '**Key dates**: when entries open and close, and the last day to withdraw',
              '**Refund on withdrawal**: how much you get back if you can’t play',
              'Buttons to add the tournament to your calendar, see the draws and schedule, and get directions',
            ],
          },
          {
            pair: {
              desktop: {
                src: 'p-tournament',
                alt: 'Tournament page with events table and key dates',
                caption: 'Tournament page on a computer.',
              },
              phone: {
                src: 'm-tournament',
                alt: 'The same tournament page on a phone',
                caption: 'The same page on a phone.',
              },
            },
          },
        ],
      },
      {
        id: 'enter',
        title: 'Enter and pay',
        blocks: [
          { p: 'Click **Enter** on the tournament page:' },
          {
            ol: [
              'Tick the events you want to play. Events you can’t play (because of gender, age or level) are greyed out with the reason.',
              'For doubles, invite your partner by member number or email. They get an email and have to accept. Still looking? Choose **I’m still looking for a partner**.',
              'Pay online with iDEAL. Your place is held for 30 minutes while you pay.',
            ],
          },
          {
            p: 'Some tournaments give a discount when you play more than one event; the entry form shows it. You get a confirmation and a receipt by email.',
          },
          {
            img: {
              src: 'p-enter',
              alt: 'Entry form with event checkboxes, fees and your details',
              caption:
                'Entry form. Your details sit on the right; if something is wrong, fix it in your profile first.',
            },
          },
        ],
      },
      {
        id: 'dashboard',
        title: 'Your dashboard',
        blocks: [
          { p: 'Your dashboard collects everything about your tournaments in five tabs:' },
          {
            ul: [
              '**My entries**: each event, its status and payment, with **Withdraw** until the deadline',
              '**My schedule**: your matches with time and court, once the schedule is published',
              '**Past tournaments**: your results',
              '**Following**: players you follow; you’re told when they play',
              '**Profile**: a shortcut to your details',
            ],
          },
          {
            pair: {
              desktop: {
                src: 'p-dashboard',
                alt: 'Player dashboard with entries, statuses and Withdraw links',
                caption: 'Dashboard on a computer. “To be paid” means a payment is still open.',
              },
              phone: {
                src: 'm-dashboard',
                alt: 'Player dashboard on a phone',
                caption: 'On a phone, the tabs scroll sideways.',
              },
            },
          },
          {
            note: '**Withdrawing:** click **Withdraw** next to the event. Whether you get money back depends on the tournament’s refund rule. iDEAL refunds can take one to five business days to reach your account.',
          },
        ],
      },
      {
        id: 'draws',
        title: 'Draws, times and results',
        blocks: [
          {
            p: 'After entries close the organiser publishes the draws, then the schedule. You get an email when your match times are ready, and another if they change. On the day the draws and results update live as the desk enters scores, so you can follow your next opponent from the sidelines.',
          },
          {
            img: {
              src: 'p-draws',
              alt: 'Public knockout draw with seeds, scores and rounds',
              caption:
                'Draws. Numbers in brackets are seeds; switch events with the buttons at the top.',
            },
          },
        ],
      },
      {
        id: 'food',
        title: 'Order food',
        blocks: [
          {
            p: 'At some tournaments you can order food before the day. Open the tournament page, choose **Food & drink**, pick your items and pay online. Allergens are listed with every item.',
          },
          {
            p: 'You get an order code with a QR code. Show it at the collection point on the day and the organiser scans it. Order before the deadline shown on the page.',
          },
          {
            pair: {
              desktop: {
                src: 'p-food',
                alt: 'Food menu with prices and allergens',
                caption: 'Food & drink menu.',
              },
              phone: {
                src: 'm-food',
                alt: 'Food menu on a phone',
                caption: 'On a phone, keep the QR code ready.',
              },
            },
          },
        ],
      },
      {
        id: 'settings',
        title: 'Profile, emails and privacy',
        blocks: [
          { p: 'Under **My account** you manage your own details:' },
          {
            ul: [
              '**Profile**: name, phone, playing levels, club and an emergency contact for the organiser',
              '**Security**: your password, and an optional passkey or authenticator app for extra safety',
              '**Email preferences**: switch reminders, results and organiser news on or off',
              '**Privacy**: download all your data, or delete your account',
            ],
          },
          {
            img: {
              src: 'p-profile',
              alt: 'My profile with personal details',
              caption:
                'My profile. Keep your phone number current; organisers use it on the tournament day.',
            },
          },
          {
            img: {
              src: 'p-notifications',
              alt: 'Email preferences with switchable emails',
              caption:
                'Email preferences. Confirmations, receipts and your match times always arrive.',
            },
          },
        ],
      },
    ],
  },

  organisers: {
    title: 'Organiser guide',
    summary: 'Run a tournament from entries and draws to the match desk and payments.',
    intro:
      'As an organiser you run your own tournaments from start to finish: events and entries, draws, the schedule, the match desk on the day, and payments. You see only the tournaments an administrator has linked to you.',
    facts: [
      { title: 'Where you work', text: 'The portal, then the tab bar of your tournament.' },
      {
        title: 'The order of work',
        text: 'Set up, open entries, draws, schedule, match day, wrap up.',
      },
      { title: 'What you need', text: 'Two-step login, the same as administrators.' },
    ],
    sections: [
      {
        id: 'overview',
        title: 'Your tournament overview',
        blocks: [
          {
            p: 'Each tournament has one tab bar: **Overview**, **Settings**, **Participants**, **Draws**, **Schedule**, **Match desk**, **Payments**, **Food & drink**, **News** and **Change log**. The overview is where you start:',
          },
          {
            ul: [
              '**Set-up**: a checklist that names the next thing to do, until it says everything is ready',
              '**Status**: the current stage and the buttons to move it on',
              '**Events**: each category with its fee, format and number of entries; **Add event** creates a new one',
            ],
          },
          {
            img: {
              src: 'o-overview',
              alt: 'Tournament overview with set-up checklist, status and events',
              caption:
                'Tournament overview. The status card also says from which date you can archive.',
            },
          },
        ],
      },
      {
        id: 'status',
        title: 'Open entries and publish',
        blocks: [
          {
            p: 'Two separate controls decide what players can do. **Status** is the stage of the tournament. **Publish** decides whether the public can see it. You can unpublish for a moment to fix something without touching entries or payments.',
          },
          {
            table: {
              head: ['Status', 'What it means'],
              rows: [
                ['Draft', 'You’re setting it up. Nobody can enter.'],
                ['Entries open', 'Players can enter and pay. Needs at least one open event.'],
                ['Entries closed', 'No new entries. Time for draws and the schedule.'],
                ['In progress', 'The tournament is being played.'],
                ['Finished', 'All results are in.'],
                [
                  'Archived',
                  'Out of your lists, kept as history. Possible from the day after the last day.',
                ],
              ],
            },
          },
          {
            note: '**Remember:** a tournament with entries open but not published can only be found through a direct link. The overview warns you about this.',
          },
        ],
      },
      {
        id: 'settings',
        title: 'Settings and logo',
        blocks: [
          {
            p: '**Settings** holds the tournament’s details: dates, deadlines, capacity, match timing, contact details and the refund rule. Choose the refund rule carefully, because players see it on the tournament page before they enter:',
          },
          {
            ul: [
              '**Automatic, before the withdrawal deadline**: the refund goes out by itself',
              '**After approval by the organisers**: you approve each refund under Payments',
              '**No refunds**',
            ],
          },
          {
            p: 'The **Percentage refunded** lets you keep part of the fee for costs, for example 90% to keep 10%. Here you also upload the tournament logo, which appears on the public page and at the top of every email about the tournament.',
          },
          {
            img: {
              src: 'o-settings',
              alt: 'Tournament settings with logo upload and organisers',
              caption: 'Settings. Landscape logos on a white or transparent background work best.',
            },
          },
        ],
      },
      {
        id: 'participants',
        title: 'Manage participants',
        blocks: [
          {
            p: '**Participants** lists every entry per event with its status and payment. From here you can:',
          },
          {
            ul: [
              '**Add entry** for a player who signs up by phone or at the club',
              '**Import** entries from Excel, or **Export (Excel)** for your own lists',
              'Mark an entry **Paid at the desk** when someone pays in cash',
              '**Cancel** an entry to free its place',
            ],
          },
          {
            p: 'When an event is full, new entries go on a waiting list. A cancellation moves the first person on the list up automatically, and they get an email.',
          },
          {
            img: {
              src: 'o-entries',
              alt: 'Participants list with status and payment per entry',
              caption: 'Participants. Filter by event, or show only the waiting list.',
            },
          },
        ],
      },
      {
        id: 'draws',
        title: 'Make the draws',
        blocks: [
          { p: 'Once entries close, open **Draws** and work through each event:' },
          {
            ol: [
              'Check the **seeds**. Tourneasy suggests them by playing level, strongest first, and you can change them.',
              'Click **Make draw** to create a draft. Only you can see it.',
              'Check it, then **publish** it. Players see it straight away on the tournament page.',
            ],
          },
          {
            p: 'Doubles entries without a partner are left out of the draw, and the page tells you how many. Formats include knockout, round robin, groups with a knockout, and Swiss rounds.',
          },
          {
            img: {
              src: 'o-draws',
              alt: 'Draws page with one row per event and its draw status',
              caption:
                'Draws. Each event shows its format, entries and whether its draw is published.',
            },
          },
        ],
      },
      {
        id: 'schedule',
        title: 'Plan the schedule',
        blocks: [
          {
            p: 'With the draws published, open **Schedule** and click **Propose schedule**. Tourneasy spreads the matches over the courts and days, using your match length and rest time, so no player is on two courts at once.',
          },
          {
            p: 'Adjust any match by hand, then publish. Players get an email with their times and courts, and later changes are marked for them. Use **Export** for a PDF or Excel copy per day or per court, for the noticeboard at the venue.',
          },
          {
            img: {
              src: 'o-schedule',
              alt: 'Schedule grid with courts, times and match cards',
              caption:
                'Schedule. Each card shows the court, event, round and players; scores appear as matches finish.',
            },
          },
        ],
      },
      {
        id: 'match-desk',
        title: 'Run the match desk',
        blocks: [
          {
            p: 'The **Match desk** is your screen on the day. It works on a laptop or a tablet at the desk:',
          },
          {
            ol: [
              '**Check-in**: tick players off as they arrive and take desk payments.',
              '**Next**: matches ready to start. Click **On court** when they begin.',
              'Enter the game scores and click **Save result**. The draw and standings update by themselves.',
              'Use **Walkover or retirement** when a match isn’t played out.',
            ],
          },
          {
            p: 'If a player hasn’t checked in a set number of minutes after their start time, the desk warns you, so you can give a walkover. You can still correct a result afterwards.',
          },
          {
            img: {
              src: 'o-matches',
              alt: 'Match desk with check-in status, On court button and score fields',
              caption:
                'Match desk. Green ticks show who’s present; “Everyone present” means the match can start.',
            },
          },
        ],
      },
      {
        id: 'payments',
        title: 'Payments and refunds',
        blocks: [
          {
            p: '**Payments** shows what was received, refunded and still outstanding for your tournament, with every order underneath. When a player withdraws and your rule is **After approval by the organisers**, the refund waits here for you to approve or reject.',
          },
          {
            p: 'Online refunds go back to the player’s bank automatically. If the player paid at the desk, you pay the money back yourself; the line says so.',
          },
          {
            img: {
              src: 'o-payments',
              alt: 'Tournament payments with totals and order list',
              caption: 'Payments. **Export (Excel)** gives your treasurer the full list.',
            },
          },
        ],
      },
      {
        id: 'food',
        title: 'Food and drink',
        blocks: [
          {
            p: 'If the site owner has switched food on for your tournament, players can order and pay for food in advance. On **Food & drink**:',
          },
          {
            ol: [
              'Tick **Ordering open for players**, set an order deadline and say where to collect.',
              'Build the menu with prices and allergens. Players see the allergens before they order.',
              'On the day, click **Scan pickup code** and scan each player’s code. The screen confirms the order and marks it handed out, and warns you if it was already collected.',
            ],
          },
          {
            img: {
              src: 'o-food',
              alt: 'Food and drink settings with ordering switch, deadline and menu',
              caption: 'Food & drink. **View as player** shows exactly what players see.',
            },
          },
        ],
      },
      {
        id: 'news',
        title: 'Send news',
        blocks: [
          {
            p: 'Use **News** for anything players should know: parking, a change of start time, a reminder to bring shuttles. Write the message in Dutch (and English if you like), then choose whether it goes on the tournament page, by email to all participants, or both.',
          },
          {
            img: {
              src: 'o-news',
              alt: 'News form with Dutch and English fields and email option',
              caption:
                'News. Players who switched off organiser news in their email preferences won’t get the email.',
            },
          },
        ],
      },
      {
        id: 'after',
        title: 'After the tournament',
        blocks: [
          {
            p: 'When the last result is in, set the status to **Finished**. In the days after the tournament, each player gets an email with their matches and placings.',
          },
          {
            p: 'From the day after the last day you can **Archive** the tournament. It leaves your lists but stays complete: results stay on the public page while it’s published, and payments and pending refunds keep working. **Change log** keeps a record of who changed what, if you ever need to check.',
          },
        ],
      },
    ],
  },

  admins: {
    title: 'Administrator guide',
    summary: 'Run the platform: tournaments, organisers, players, venues and payments.',
    intro:
      'As an administrator you run the platform as a whole. You create tournaments, decide who organises them, and keep the shared lists of players, venues and clubs accurate. Running a single tournament day to day is covered in the organiser guide.',
    facts: [
      { title: 'Where you work', text: 'The portal, through the shield icon in the top bar.' },
      { title: 'What you see', text: 'Every tournament, every player, every payment.' },
      { title: 'What you need', text: 'Two-step login. Without it the portal stays closed.' },
    ],
    sections: [
      {
        id: 'two-step',
        title: 'Set up two-step login',
        blocks: [
          {
            p: 'Two-step login protects the platform, so admins and organisers can’t open the portal without it. You set it up once:',
          },
          {
            ol: [
              'Open **My account → Security**.',
              'Choose **Add a passkey on this device** (Face ID, Touch ID, Windows Hello) or **Set up the app** (Google Authenticator, Microsoft Authenticator, 1Password).',
              'Save the 10 recovery codes somewhere safe, such as a password manager. Each code works once, if you lose your phone.',
            ],
          },
          {
            p: 'You can add a passkey for every device you use. The page shows how many recovery codes you have left, and **Make new recovery codes** replaces them at any time.',
          },
          {
            img: {
              src: 'a-security',
              alt: 'The Security page with Passkey and Authenticator app options',
              caption:
                'Security page. A passkey is the fastest option; the authenticator app also works in the Tourneasy mobile app.',
            },
          },
        ],
      },
      {
        id: 'overview',
        title: 'Read the overview',
        blocks: [
          {
            p: 'The overview is your daily check. It answers three questions: what needs attention, how big the platform is, and what’s coming up.',
          },
          {
            ul: [
              '**Needs attention**: problems worth a click, such as a tournament taking entries while it’s still hidden, or entries that haven’t been paid',
              '**Counters**: players, accounts, venues and clubs',
              '**Tournaments by status**: one click filters the tournament list',
              '**Upcoming tournaments**: the next events in date order',
            ],
          },
          {
            img: {
              src: 'a-overview',
              alt: 'Admin overview with alerts, counters and upcoming tournaments',
              caption:
                'Admin overview. The amber rows link straight to the place where you fix them.',
            },
          },
        ],
      },
      {
        id: 'create',
        title: 'Create a tournament',
        blocks: [
          {
            p: 'Click **New tournament** on the overview or the tournament list, then fill in the form:',
          },
          {
            ol: [
              '**General**: the name, the type and the venue. Choose **Own tournament** when you organise it yourself, or **External organiser** when a club runs it on Tourneasy.',
              '**Dates and entries**: the tournament days, when entries open and close, and the last moment players can withdraw.',
              '**Match timing**: minutes per match, rest between matches and the start time. The scheduler uses these later; the defaults suit most club tournaments.',
            ],
          },
          {
            p: 'After saving you land on the tournament overview. Add the events there (for example Men’s singles Senior A) with their fee, maximum entries and match format.',
          },
          {
            img: {
              src: 'a-new',
              alt: 'New tournament form with General and Dates and entries sections',
              caption:
                'New tournament form. Fields with an i icon explain themselves when you hover over or tap them.',
            },
          },
          {
            note: '**Tip:** a new tournament starts as a hidden draft. Players see nothing until someone sets it to **Entries open** and clicks **Publish**.',
          },
        ],
      },
      {
        id: 'tournaments',
        title: 'Manage all tournaments',
        blocks: [
          {
            p: 'The tournament list shows every tournament with its dates, venue, entries and two labels: its status and whether it’s published. Under each one are shortcuts to **Participants**, the **Match desk** and the public page.',
          },
          {
            p: 'Archived tournaments leave this list. To see them again, choose **Archived** in the status filter. You can archive a tournament from the day after its last day.',
          },
          {
            img: {
              src: 'a-tournaments',
              alt: 'Tournament list with status and published labels',
              caption:
                'Tournament list. The warning label flags a tournament that takes entries but isn’t published.',
            },
          },
        ],
      },
      {
        id: 'roles',
        title: 'Give organiser rights',
        blocks: [
          {
            p: 'An organiser can manage only the tournaments you link to them. Giving those rights takes two steps:',
          },
          {
            ol: [
              'Open **Users and roles**, search for the person by name, email or member number, and click **Grant** in the organiser column.',
              'Open the tournament, go to **Settings → Organisers** and add them.',
            ],
          },
          {
            p: 'The **2FA** column shows who has two-step login. New organisers set it up the first time they open the portal. Every role change is written to the audit log.',
          },
          {
            img: {
              src: 'a-users',
              alt: 'Users and roles list with roles, 2FA status and Grant buttons',
              caption: 'Users and roles. Search first; the list can be long.',
            },
          },
        ],
      },
      {
        id: 'players',
        title: 'Look after players',
        blocks: [
          {
            p: '**Players** lists everyone on the platform, with or without an account. Use it to:',
          },
          {
            ul: [
              '**New player**: add someone who has no account yet, for example for a desk entry',
              '**Import**: load a club’s member list from Excel',
              '**Merge**: fold a duplicate into the right profile; entries and teams move along',
              'Filter by gender, preferred event, club or account',
            ],
          },
          {
            p: 'Players under 16 carry an **Under 16** label. They never appear in the public player search.',
          },
          {
            img: {
              src: 'a-players',
              alt: 'Player list with filters and Under 16 labels',
              caption:
                'Players. Click a name to edit the profile, see history or merge a duplicate.',
            },
          },
        ],
      },
      {
        id: 'venues',
        title: 'Keep venues and clubs tidy',
        blocks: [
          {
            p: 'Venues and clubs are shared lists that every tournament and profile picks from. Add a venue once, with its address and number of courts, and organisers can choose it from then on. The court count matters: the scheduler plans matches across exactly that many courts.',
          },
          {
            p: 'When a venue closes or a club merges, archive it instead of deleting it. Past tournaments keep their history, and new ones can’t pick it any more.',
          },
          {
            img: {
              src: 'a-venues',
              alt: 'Venue list with town, province and number of courts',
              caption: 'Venues. Tick **Show archived** to bring archived venues back into view.',
            },
          },
        ],
      },
      {
        id: 'payments',
        title: 'Follow the money',
        blocks: [
          {
            p: '**Payments** shows every order across all tournaments: what came in, what went back and what is still outstanding. Filter by tournament or status to answer questions from organisers or players.',
          },
          {
            p: 'Online payments arrive through Stripe, mostly by iDEAL. Payments taken at the desk appear as **At the desk**. Refunds through iDEAL go back by bank transfer, so they can stay pending for one to five business days before they show as refunded.',
          },
          {
            img: {
              src: 'a-payments',
              alt: 'Payments overview with received, refunded and outstanding totals',
              caption: 'Payments. Each organiser sees the same view for their own tournament.',
            },
          },
        ],
      },
      {
        id: 'owner',
        title: 'Owner settings',
        blocks: [
          {
            p: 'The owner is the administrator with the final say. A few settings are visible to the owner only, because they control money, email and the look of the whole site:',
          },
          {
            table: {
              head: ['Setting', 'What it controls'],
              rows: [
                ['Appearance', 'The site’s colour theme.'],
                ['Email', 'The mail server, a test email, pausing all mail, and the email texts.'],
                [
                  'Stripe settings',
                  'The payment keys and webhook. Locked behind the owner’s password for 10 minutes at a time.',
                ],
                [
                  'Pricing',
                  'Paid packages for organisers, club discounts and invoices. Off until the owner switches it on.',
                ],
                [
                  'Food access',
                  'Which tournaments may offer food ordering: a switch on each tournament overview.',
                ],
                ['Audit log', 'Every important change on the site: who, what and when.'],
                [
                  'Reset two-step login',
                  'Removes a user’s passkeys and app when they’ve lost every device and code.',
                ],
              ],
            },
          },
        ],
      },
    ],
  },
};
