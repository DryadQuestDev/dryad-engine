# Google Docs Integration

Write your dungeon content in Google Docs and import it directly into your game. Great for collaborative writing and working in a familiar editor.

To start, go to **Dungeons → Config** in the editor and click **Google Documents Integration**.

---

## Option A: Use an Existing Token

If you already have a token, or you're collaborating with someone who shared theirs:

1. Copy the token into the **Google Document Integration** form (Dungeons → Config tab)

@en/gdoc/0.png

2. If you see an error about missing permissions, follow the link in the error message to enable the Google Docs API.

If the token works, skip ahead to **Stage 3: Import Your Document**.

Otherwise, continue with Stage 1 and 2 below.

---

## Stage 1: Set Up a Google Project

> Your credentials are saved locally on your PC only.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)

2. Create a new project: click the button next to the Google Cloud logo, then click **New Project**

@en/gdoc/1.png
@en/gdoc/2.png

3. Enter any project name, skip Location, and click **Create**

@en/gdoc/3.png

4. Select your new project by clicking the button next to the Google Cloud logo

@en/gdoc/1.png
@en/gdoc/4.png

5. Go to [Google Docs API](https://console.cloud.google.com/apis/api/docs.googleapis.com) and click **Enable**

@en/gdoc/8b.png

6. Go to [Google Auth Platform](https://console.cloud.google.com/auth/) and click **Get Started**

@en/gdoc/9.png

7. Fill in the form (App name can be anything). In step 2, choose **External**

@en/gdoc/10.png

8. Click **OAuth client** to create one

@en/gdoc/11.png

9. Choose **Desktop app** as the Application Type. Name can be anything. Click **Create**, then **Ok**

@en/gdoc/12.png

10. Download the OAuth client by clicking the download icon

@en/gdoc/14.png

11. Go to [Auth Audience](https://console.cloud.google.com/auth/audience) and click **Add users**. Add the Google account you use for Google Docs (can be the same email you registered with). Ignore any warnings about the user not being added.

@en/gdoc/15.png

12. Back in the game editor, go to **Dungeons → Config → Google Document Integration → OAuth Apps**. Open the `client_secret` file you downloaded in step 10, copy its contents into the form, and click **Save OAuth App Configuration**

@en/gdoc/16.png

---

## Stage 2: Create a Token

1. Open the **Create New Token** tab and click **Start Authentication with Google**. A browser window will open.

@en/gdoc/17.png

2. Choose your Google account and click **Continue** through the permission screens. Make sure the checkbox to access your Google Docs is enabled.

@en/gdoc/22.png
@en/gdoc/selected.png

---

## Stage 3: Import Your Document

You're ready to fetch Google Docs directly into your game!

Make sure you have the correct token selected in **Google Document Integration → User Tokens**. You can have multiple tokens for different Google accounts (useful for collaboration).

1. Enter the Google Document link or ID in the `gdoc_id` config field

@en/gdoc/24.png

2. Click **Fetch Google Document**. The content will be imported into the `dungeon_content` field.

@en/gdoc/25.png

---

> **Note:** You only need to set up your token once (Stages 1 & 2). After that, you can use it for all your games.
