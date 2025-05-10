import { NextResponse, type NextRequest } from "next/server";
import { uploadFragment } from "~/utils/cloud";
import { hash } from "argon2";
import { db } from "~/utils/db";
import { encryptFragment, fragmentFile } from "~/utils/file";
import { auth } from "@clerk/nextjs/server";

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file: File = formData.get("file") as File;
    const secretKey = formData.get("secretKey") as string;
    const { userId } = await auth();

    if (!file) {
      return NextResponse.json(
        { success: false, message: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!secretKey) {
      return NextResponse.json(
        {
          success: false,
          message: "No secret key sent",
        },
        { status: 400 }
      );
    }

    const fragments = await fragmentFile(file, 1024 * 1024); // 1MB chunks

    const encryptedFragments = fragments.map(async (fragment) => {
      const encrypted = await encryptFragment(fragment.blob, secretKey);
      return encrypted;
    });

    const encryptedFragmentsArray = await Promise.all(encryptedFragments);

    const uploadPromises = encryptedFragmentsArray.map(
      async (fragment, index) => {
        const result = await uploadFragment(
          new Blob([fragment]),
          file.name,
          index
        );
        return result;
      }
    );

    const results = await Promise.all(uploadPromises);

    // Check for any upload errors
    const errors = results.filter((result) => result && !result.success);
    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Error uploading fragments",
          errors,
        },
        {
          status: 500,
        }
      );
    }

    const key = await hash(secretKey);

    await db.file.create({
      data: {
        name: file.name,
        key,
        user: userId as string,
        fragments: results
          .map((result) => result?.url)
          .filter((url): url is string => url !== undefined),
      },
    });

    return NextResponse.json(
      {
        message: "File uploaded and fragmented successfullty",
        fragmentURLs: results.map((result) => result?.url),
      },
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(error.message);
    return NextResponse.json(
      { success: false, message: "An error occured" },
      { status: 500 }
    );
  }
}
