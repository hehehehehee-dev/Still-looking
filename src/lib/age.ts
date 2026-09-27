// Age math shared by the browser (to show "photo age → age today") and the server
// (which recomputes it, so it never trusts numbers typed into the page).

const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

/** Years between two dates, as a decimal (e.g. 5.5). */
export function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_YEAR;
}

export type AgePlan = {
  photoAge: number; // age of the child in the uploaded photo (whole years)
  targetAge: number; // age the child is today (whole years)
  gapYears: number; // how many years we are asking the model to add
};

/**
 * Works out the child's age in the photo and today.
 * Returns an error message instead if the dates don't make sense.
 */
export function planAges(
  dateOfBirth: string,
  photoDate: string,
  today: Date = new Date(),
): AgePlan | { error: string } {
  const dob = new Date(dateOfBirth);
  const photo = new Date(photoDate);
  if (isNaN(dob.getTime()) || isNaN(photo.getTime())) {
    return { error: "Please enter both dates." };
  }
  if (photo < dob) return { error: "The photo date is before the date of birth." };
  if (photo > today) return { error: "The photo date is in the future." };

  const photoAge = Math.floor(yearsBetween(dob, photo));
  const targetAge = Math.floor(yearsBetween(dob, today));
  const gapYears = targetAge - photoAge;

  if (targetAge > 60) return { error: "This tool is designed for children and young adults (up to 60)." };
  if (gapYears < 1) return { error: "The photo is less than a year old, so there is nothing to age." };

  return { photoAge, targetAge, gapYears };
}
