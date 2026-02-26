const es = {
  brandTitle: 'MBTA Tracker',
  subtitle: 'Enfoque entrante · rumbo a Bowdoin',
  controls: {
    stop: 'Parada',
    refresh: 'Actualizar',
    languageLabel: 'Idioma',
    switchToEnglish: 'Cambiar a inglés',
    switchToSpanish: 'Cambiar a español',
  },
  status: {
    selected: 'Parada seleccionada',
    updated: 'Última actualización',
  },
  alerts: {
    error: 'Error',
    automation: 'Error de automatización',
    inboundIntegrity: 'La vista entrante ya no muestra trenes a Bowdoin.',
    outboundIntegrity: 'La vista saliente ya no muestra trenes a Wonderland.',
  },
  walk: {
    label: 'Salida a Bowdoin',
    idleTitle: 'Esperando tiempos',
    idleSubtitle: 'Aún no hay predicciones entrantes.',
    trainIn: 'tren en',
    leaveNow: 'Sal ahora',
    leaveSoon: 'Sal en',
    walkBufferText: (walkMinutes, refreshSeconds) =>
      `Buffer de caminata: ${walkMinutes} min · actualización API cada ${refreshSeconds}s`,
  },
  flashcards: {
    inboundLabel: 'Entrante · Bowdoin',
    inboundNextPrefix: 'Siguiente',
    noDepartures: 'Sin salidas entrantes',
    outboundLabel: 'Saliente · Wonderland',
    outboundTitle: 'Programa de salida',
    outboundEmpty: 'Las salidas a Wonderland aparecen aquí cuando haya datos.',
    primaryEmpty: 'Los tiempos entrantes llegan pronto.',
    flipToOutboundTitle: 'Mostrar salidas a Wonderland',
    flipToInboundTitle: 'Mostrar salidas a Bowdoin',
    missedSuffix: ' (perdido)',
    scheduledLabel: 'Programado',
    heroLabel: 'Temporizador de salida',
    heroIdleTitle: 'Esperando tiempos',
    heroIdleSubtitle: 'Aún no hay predicciones entrantes.',
    timetableLabel: 'Próximos trenes',
    volumeLabel: 'Automatización de volumen',
    navigationLabel: 'Cambiar tarjeta',
    prevCard: 'Tarjeta anterior',
    nextCard: 'Siguiente tarjeta',
  },
  volumePanel: {
    label: 'Aumento de volumen',
    statusLabel: 'Estado',
    nextTriggerLabel: 'Próximo disparo',
    raise: 'Subir',
    restore: 'Restaurar',
    passHelp: 'Registra los trenes cuando pasan para mejorar los tiempos.',
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
      outbound_arrival: 'Aproximación a Wonderland',
      inbound_departure: 'Salida de Bowdoin',
    },
    statuses: {
      disabled: 'Desactivado',
      active: 'Activo',
      armed: 'Preparado',
    },
    upcomingIn: 'en',
  },
};

export default es;
