import { createServerFn } from "@tanstack/react-start";

export const getCollections = createServerFn({ method: "GET" }).handler(async () => {
  const { listRootCollections } = await import("./firestore.server");
  const collections = await listRootCollections();
  return { collections };
});

export const getCollectionDocs = createServerFn({ method: "GET" })
  .inputValidator((data: { collection: string }) => {
    if (!data?.collection || typeof data.collection !== "string") {
      throw new Error("collection is required");
    }
    if (!/^[A-Za-z0-9_-]+$/.test(data.collection)) {
      throw new Error("invalid collection name");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const { listDocuments } = await import("./firestore.server");
    const docs = await listDocuments(data.collection);
    return { docs };
  });
