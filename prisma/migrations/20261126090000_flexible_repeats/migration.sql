-- Repeating tasks on chosen weekdays, monthly, or on hand-picked dates.
ALTER TYPE "RepeatFrequency" ADD VALUE 'DAYS_OF_WEEK';
ALTER TYPE "RepeatFrequency" ADD VALUE 'MONTHLY';
ALTER TYPE "RepeatFrequency" ADD VALUE 'DATES';

ALTER TABLE "TaskSeries" ADD COLUMN "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "monthDay" INTEGER,
ADD COLUMN "dates" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[];
