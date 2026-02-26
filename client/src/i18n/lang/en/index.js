const en = {
  brandTitle: 'MBTA Tracker',
  subtitle: 'Inbound focus · Bowdoin bound',
  controls: {
    stop: 'Stop',
    refresh: 'Refresh',
    languageLabel: 'Language',
    switchToEnglish: 'Switch to English',
    switchToSpanish: 'Switch to Spanish',
  },
  status: {
    selected: 'Selected stop',
    updated: 'Last update',
  },
  alerts: {
    error: 'Error',
    automation: 'Automation action error',
    inboundIntegrity: 'Inbound view no longer shows Bowdoin trains.',
    outboundIntegrity: 'Outbound view no longer shows Wonderland trains.',
  },
  walk: {
    label: 'Bowdoin departure',
    idleTitle: 'Waiting for timing',
    idleSubtitle: 'No inbound predictions yet.',
    trainIn: 'train in',
    leaveNow: 'Leave now',
    leaveSoon: 'Leave in',
    walkBufferText: (walkMinutes, refreshSeconds) => `Walk buffer: ${walkMinutes} min · API refresh ${refreshSeconds}s`,
  },
  flashcards: {
    inboundLabel: 'Inbound · Bowdoin',
    inboundNextPrefix: 'Next',
    noDepartures: 'No inbound departures',
    outboundLabel: 'Outbound · Wonderland',
    outboundTitle: 'Outbound timetable',
    outboundEmpty: 'Outbound arrivals show up here once available.',
    primaryEmpty: 'Inbound timing settles soon.',
    flipToOutboundTitle: 'Flip to Wonderland outbound',
    flipToInboundTitle: 'Flip to Bowdoin inbound',
    missedSuffix: ' (missed)',
    scheduledLabel: 'Scheduled',
    heroLabel: 'Leave timer',
    heroIdleTitle: 'Waiting for timing',
    heroIdleSubtitle: 'No inbound predictions yet.',
    timetableLabel: 'Upcoming trains',
    volumeLabel: 'Volume automation',
    navigationLabel: 'Switch flash card',
    prevCard: 'Previous flash card',
    nextCard: 'Next flash card',
  },
  volumePanel: {
    label: 'Volume boost',
    statusLabel: 'Status',
    nextTriggerLabel: 'Next trigger',
    raise: 'Raise',
    restore: 'Restore',
    passHelp: 'Log the trains as they pass so offsets can learn your timing.',
    passButtons: {
      bowdoin: 'BOWDOIN TRAIN PASSING',
      wonderland: 'WONDERLAND TRAIN PASSING',
    },
    directions: {
      bowdoin: 'Bowdoin',
      wonderland: 'Wonderland',
    },
  },
  automation: {
    modes: {
      outbound_arrival: 'Wonderland approach',
      inbound_departure: 'Bowdoin post-departure',
    },
    statuses: {
      disabled: 'Disabled',
      active: 'Active',
      armed: 'Armed',
    },
    upcomingIn: 'in',
  },
  access: {
    prompt: {
      message: 'Need a text-first layout? Enable the accessible view.',
      enableLabel: 'Enable accessible view',
      dismissLabel: 'Stay on the default layout',
    },
    heroHint: 'Press Tab to reveal accessible controls.',
  },
};

export default en;
