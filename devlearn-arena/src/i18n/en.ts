import type { TKey } from './ja';

/** 未訳キーは ja にフォールバックする。ここは全て埋まっている状態を保つ。 */
export const en: Record<TKey, string> = {
  'app.name': 'DevLearn Arena',
  'app.tagline': 'Type a command. The state changes. The diagram moves.',

  'nav.home': 'Home',
  'nav.map': 'World map',
  'nav.sandbox': 'Sandbox',
  'nav.dashboard': 'Progress',
  'nav.settings': 'Settings',
  'nav.skip': 'Skip to content',

  'home.next': 'What to do next',
  'home.warmupLead':
    'Start by getting used to the terminal. Every command you type changes the diagram on screen. Finish three steps to clear it.',
  'home.start': 'Start the mission',
  'home.clearedLead': 'Lessons you have cleared.',
  'home.buildStatus': 'Build phase',
  'home.buildLead': 'The shell, Git, Kubernetes, networking and GitHub simulators all run in the browser.',
  'home.worlds': 'Four worlds',
  'home.worldsLead': 'Pick a field and work through it chapter by chapter.',

  'sandbox.title': 'Sandbox',
  'sandbox.lead':
    'A free space outside the curriculum. Commands change the view on the right, and the time bar below takes you back to any earlier state.',
  'sandbox.toMissions': 'Back to missions',
  'sandbox.viewLabel': 'Switch view',
  'sandbox.splitLabel': 'Pane width',
  'sandbox.tab.world': 'Files',
  'sandbox.tab.git': 'Git',
  'sandbox.tab.k8s': 'Cluster',
  'sandbox.tab.net': 'Network',
  'sandbox.tab.gh': 'GitHub',
  'sandbox.fileTree': 'File tree',
  'sandbox.snapshots': '{n} snapshots / virtual clock tick {tick}',

  'map.title': 'World map',
  'map.lead':
    'Follow the path across the worlds. Each area ends with a boss — a real incident to work through.',
  'map.chapters': 'Areas',
  'map.lessons': 'Quests',
  'map.bosses': 'Bosses',
  'map.ready': 'Playable',
  'map.planned': 'Planned',
  'map.phase': 'Build phase',
  'map.openTrack': 'Open this track',

  'track.goal': 'Goal',
  'track.back': 'Back to the world map',
  'track.chapter': 'Chapter {n}',
  'track.minutes': 'about {n} min',
  'track.cleared': 'Cleared',

  'lesson.back': 'Back to the chapter list',
  'lesson.terminal': 'Terminal',
  'lesson.visualizer': 'Live diagram',
  'lesson.plannedTitle': 'This lesson is not playable yet',
  'lesson.plannedBody':
    'It becomes available in build phase {phase}. For now it is here as part of the outline.',
  'lesson.play': 'Take on this mission',
  'lesson.readyTitle': 'This mission is playable',
  'lesson.readyBody':
    'You will move to the hands-on screen with a terminal on the left. Your progress is saved automatically.',
  'lesson.docs': 'Sources',
  'lesson.kind.concept': 'Concept',
  'lesson.kind.drill': 'Drill',
  'lesson.kind.challenge': 'Challenge',
  'lesson.kind.boss': 'Incident',

  'dash.title': 'Progress',
  'dash.level': 'Level {n}',
  'dash.rank': 'Rank',
  'dash.xp': '{a} / {b} XP',
  'dash.streak': '{n}-day streak',
  'dash.cleared': '{n} lessons cleared',
  'dash.recent': 'Recent activity',
  'dash.streakTitle': 'Days you practised',
  'dash.dayActive': 'Practised on {d}',
  'dash.dayIdle': 'No practice on {d}',
  'dash.badges': 'Achievements {a} / {b}',
  'dash.badgeEarned': 'Earned',
  'dash.empty': 'Nothing recorded yet. Open your first chapter from the world map.',

  'settings.title': 'Settings',
  'settings.motion': 'Animation',
  'settings.motion.system': 'Follow the OS setting',
  'settings.motion.reduced': 'Always keep it subtle',
  'settings.tick': 'Virtual clock speed',
  'settings.data': 'Learning data',
  'settings.export': 'Export progress',
  'settings.import': 'Import progress',
  'settings.reset': 'Erase progress',
  'settings.resetConfirm': 'This erases all progress. It cannot be undone.',
  'settings.imported': 'Progress imported.',
  'settings.importFailed': 'Could not read that. Check that it is a file you exported.',
  'settings.storageNote': 'Progress is stored only in this browser, on this device.',

  'notfound.title': 'That page does not exist',
  'notfound.body': 'The URL may have changed, or the page is not there yet.',
  'notfound.cta': 'Go to the world map',

  'onboarding.title': 'Welcome',
  'onboarding.lead':
    'This is a practice ground where typing a command really does change the state. You are not memorising answers — you are moving state and checking what happened.',
  'onboarding.step1':
    'Type into the terminal on the left. Tab completes, and the up arrow walks the history.',
  'onboarding.step2': 'The diagram on the right shows the current state. It moves as you type.',
  'onboarding.step3':
    'Every step states what has to be true to pass. There is more than one way to get there.',
  'onboarding.note': 'Nothing is lost when you fail. Break things and find out.',
  'onboarding.start': 'Get started',

  'common.loading': 'Loading',
  'error.title': 'The screen failed to render',
};
