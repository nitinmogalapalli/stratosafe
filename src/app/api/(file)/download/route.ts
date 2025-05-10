import { verify } from "argon2";
import { NextRequest, NextResponse } from "next/server";
import { db } from "~/utils/db";
import { decryptFragment, mergeFragments } from "~/utils/file";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const fileId = formData.get("fileName") as string;
    const secretKey = formData.get("secretKey") as string;

    if (!fileId) {
      console.log("No file found");
      return NextResponse.json(
        { success: false, message: "No file found" },
        { status: 400 }
      );
    }

    if (!secretKey) {
      console.log("No secret key sent");
      return NextResponse.json(
        {
          success: false,
          message: "No secret key sent",
        },
        { status: 400 }
      );
    }

    const { fragments: fragmentLinks, key } = await db.file.findFirstOrThrow({
      where: {
        id: fileId,
      },
    });

    const verifyKey = await verify(key, secretKey);

    if (!verifyKey) {
      console.log("Invalid secret key");
      return NextResponse.json(
        { success: false, message: "Invalid secret key" },
        { status: 400 }
      );
    }

    const fragments = await Promise.all(
      fragmentLinks.map(async (fragmentLink) => {
        const res = await fetch(fragmentLink);
        const blob = await res.blob();
        return blob;
      })
    );

    const decryptFragments = await Promise.all(
      fragments.map(async (fragment) => {
        const decrypted = await decryptFragment(fragment, secretKey);
        return new Blob([decrypted]);
      })
    );

    const file = await mergeFragments(decryptFragments);

    const fileData = await file.arrayBuffer();

    return new Response(fileData, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": 'attachment; filename="image.jpg"',
      },
    });
  } catch (error) {
    console.error(error.message);
    return { status: 500, body: "Internal Server Error" };
  }
}
