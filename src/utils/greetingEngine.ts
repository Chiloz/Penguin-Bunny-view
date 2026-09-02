export interface GreetingDetails {
  headline: string;
  subGreeting: string;
  questionPrompt: string;
  dateBadge: string;
  seasonalBadge: string;
  moodEmoji: string;
}

/**
 * Extracts a friendly name from raw usernames.
 * e.g., "Penguin21" -> "Penguin"
 * e.g., "josaphat99" -> "Josaphat"
 * e.g., "Alex_Cool_2026" -> "Alex"
 */
export function formatFriendlyName(rawName: string): string {
  if (!rawName) return 'Penguin';
  
  // Trim and remove trailing numbers or underscores (e.g. "Penguin21" -> "Penguin")
  let clean = rawName.trim().replace(/[_\d]+$/, '').trim();
  
  // If user has full name like "Josaphat Kychilo", take the first name
  if (clean.includes(' ')) {
    clean = clean.split(' ')[0];
  }

  if (!clean) return rawName.trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Generates dynamic, context-aware greetings based on:
 * - Specific user name ("hi penguin welcome back")
 * - Time of day (morning, afternoon, evening, late night)
 * - Questions ("what are we gonna watch today or tonight or this morning")
 * - Day of the week (Friday movie night, weekend binge, mid-week refresh)
 * - Month and Season (Autumn cozy vibes, Halloween, Winter holidays, Summer blockbusters)
 * - Exact date
 */
export function getWelcomeGreeting(rawName: string, customDate?: Date): GreetingDetails {
  const now = customDate || new Date();
  const friendlyName = formatFriendlyName(rawName);
  
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const month = now.getMonth();   // 0 = Jan, 8 = Sept, 11 = Dec
  const date = now.getDate();     // 1 - 31

  // Format date display (e.g. "Wednesday, September 2")
  const dateBadge = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  // 1. Time of Day Determination
  let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night' = 'evening';
  let timeGreeting = 'Good evening';
  let timeQuestion = 'what are we gonna watch tonight?';
  let moodEmoji = '✨';

  if (hour >= 5 && hour < 12) {
    timeOfDay = 'morning';
    timeGreeting = 'Good morning';
    timeQuestion = 'what are we gonna watch this morning?';
    moodEmoji = '☀️';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
    timeGreeting = 'Good afternoon';
    timeQuestion = 'what are we gonna watch this afternoon?';
    moodEmoji = '🍿';
  } else if (hour >= 17 && hour < 22) {
    timeOfDay = 'evening';
    timeGreeting = 'Good evening';
    timeQuestion = 'what are we gonna watch tonight?';
    moodEmoji = '🌙';
  } else {
    timeOfDay = 'night';
    timeGreeting = 'Night owl hours';
    timeQuestion = 'what are we gonna watch tonight?';
    moodEmoji = '🌌';
  }

  // 2. Base Headline Options (e.g. "Hi penguin, welcome back!")
  const headlineOptions = [
    `Hi ${friendlyName}, welcome back!`,
    `Welcome back, ${friendlyName}!`,
    `Hey ${friendlyName}, great to see you!`,
    `${timeGreeting}, ${friendlyName}!`,
    `Hi ${friendlyName}!`
  ];

  // Pick a semi-random or time-based headline
  const headlineIndex = Math.floor(Math.random() * headlineOptions.length);
  const headline = headlineOptions[headlineIndex];

  // 3. Question Prompts
  const questionsList = [
    timeQuestion.charAt(0).toUpperCase() + timeQuestion.slice(1),
    `What are we gonna watch today, ${friendlyName}?`,
    `Ready for another movie session? What's on your mind?`,
    `Got your popcorn ready? What are we streaming?`,
    `Looking for an anime marathon or a blockbuster movie?`
  ];
  const questionPrompt = questionsList[Math.floor(Math.random() * questionsList.length)];

  // 4. Day of the Week Greetings
  let dayMessage = '';
  switch (dayOfWeek) {
    case 0: // Sunday
      dayMessage = `Lazy Sunday cinema mode: sit back, relax, and enjoy.`;
      break;
    case 1: // Monday
      dayMessage = `Fresh start to the week! A quick show or an inspiring story?`;
      break;
    case 2: // Tuesday
      dayMessage = `Terrific Tuesday: great day to start a new TV series or anime!`;
      break;
    case 3: // Wednesday
      dayMessage = `Happy Hump Day! You're halfway through the week—time for a movie treat.`;
      break;
    case 4: // Thursday
      dayMessage = `Almost Friday! Warm up for the weekend with an epic watch.`;
      break;
    case 5: // Friday
      dayMessage = `Happy Friday! The weekend watch party officially kicks off now!`;
      moodEmoji = '🎉';
      break;
    case 6: // Saturday
      dayMessage = `Saturday night prime time! Prime hours for cinema & chill.`;
      moodEmoji = '🌟';
      break;
  }

  // 5. Month & Seasonal Themes
  let seasonalBadge = 'Cozy Cinema';
  let seasonalMessage = '';

  if (month === 8) { // September
    seasonalBadge = '🍂 Autumn Premiere Season';
    seasonalMessage = 'September breezes & cozy fall watchlist vibes.';
  } else if (month === 9) { // October
    seasonalBadge = '🎃 Spooky Cinema Season';
    seasonalMessage = 'October chills: perfect time for thrillers, mysteries, or comfort anime.';
  } else if (month === 10) { // November
    seasonalBadge = '🍁 Thanksgiving & Autumn Mood';
    seasonalMessage = 'November warmth: gather your crew for a sync watch.';
  } else if (month === 11) { // December
    seasonalBadge = '❄️ Holiday Wonder Season';
    seasonalMessage = 'December magic: festive marathons & winter wonderland watches.';
  } else if (month === 0) { // January
    seasonalBadge = '🎆 New Year Cinema';
    seasonalMessage = 'New Year, new stories to explore together!';
  } else if (month === 1) { // February
    seasonalBadge = '💖 Romance & Passion Month';
    seasonalMessage = 'Heartfelt stories and warm winter double features.';
  } else if (month >= 2 && month <= 4) { // March - May
    seasonalBadge = '🌱 Springtime Bloom';
    seasonalMessage = 'Fresh spring energy and exciting new releases.';
  } else { // June - August
    seasonalBadge = '☀️ Summer Blockbusters';
    seasonalMessage = 'Summer heat outside, thrilling blockbusters inside.';
  }

  // Special Date Overrides
  if (date === 1) {
    seasonalMessage = `Welcome to a brand new month (${now.toLocaleString('default', { month: 'long' })})! Time to discover fresh gems.`;
  } else if (month === 9 && date === 31) {
    seasonalBadge = '👻 Halloween Night';
    seasonalMessage = 'Happy Halloween! Dim the lights and get ready for a spooky watch.';
  } else if (month === 11 && (date === 24 || date === 25)) {
    seasonalBadge = '🎄 Merry Christmas';
    seasonalMessage = 'Warm holiday greetings and joyful holiday films!';
  } else if (month === 11 && date === 31) {
    seasonalBadge = '🎊 New Year’s Eve';
    seasonalMessage = 'Count down the year with the best cinema moments!';
  }

  const subGreeting = `${dayMessage} ${seasonalMessage}`.trim();

  return {
    headline,
    subGreeting,
    questionPrompt,
    dateBadge,
    seasonalBadge,
    moodEmoji
  };
}
