import type { Metadata } from "next";
import CreateFlow from "./CreateFlow";

export const metadata: Metadata = { title: "Create an estimate · Still Looking" };

export default function CreatePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Create an age-progressed estimate</h1>
        <p className="mt-2 text-muted">
          Add a photo of the child and, if you have them, photos of their biological family.
        </p>
      </div>
      <CreateFlow />
    </div>
  );
}
