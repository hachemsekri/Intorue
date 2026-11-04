import { redirect } from 'next/navigation';

// The live map becomes the home page in Milestone 2.
export default function Home() {
  redirect('/vehicles');
}
