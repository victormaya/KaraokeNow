export interface Song {
  id: string;
  title: string;
  channel: string;
  duration: string;
  thumbnail: string;
  url: string;
}

export type JobStatus =
  | "idle"
  | "pending"
  | "downloading"
  | "separating"
  | "done"
  | "error";

export interface Job {
  job_id: string;
  status: JobStatus;
  audio_url: string | null;
  error: string | null;
}
