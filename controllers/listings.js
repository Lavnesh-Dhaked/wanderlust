const Listing = require("../models/listing");
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const mapToken = process.env.MAP_TOKEN;
const geoCodingClient = mbxGeocoding({ accessToken: mapToken });
const nodemailer = require("nodemailer");

module.exports.index = async (req, res) => {
  let allListings = await Listing.find();
  res.render("./listings/index.ejs", { allListings });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
  let { id } = req.params;
  let listing = await Listing.findById(id)
    .populate({ path: "reviews", populate: { path: "author" } })
    .populate("owner");
  if (!listing) {
    req.flash("error", "Listing you requested for does not exist!");
    res.redirect("/listings");
  }
  res.render("listings/show.ejs", { listing });
};

module.exports.createListing = async (req, res, next) => {
  let response = await geoCodingClient
    .forwardGeocode({
      query: req.body.listing.location,
      limit: 1,
    })
    .send();

  let url = req.file.path;
  let filename = req.file.filename;

  const newListing = new Listing(req.body.listing);
  newListing.owner = req.user._id;
  newListing.image = { filename, url };
  newListing.geometry = response.body.features[0].geometry;
  await newListing.save();
  req.flash("success", "New listing created!");
  res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
  let { id } = req.params;
  let listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you trying to edit for does not exist!");
    res.redirect("/listings");
  }
  imageUrl = listing.image.url;
  imageUrl = imageUrl.replace("/upload", "/upload/w_250,h_160");
  res.render("listings/edit.ejs", { listing, imageUrl });
};

module.exports.updateListing = async (req, res, next) => {
  let { id } = req.params;
  let response = await geoCodingClient
    .forwardGeocode({
      query: ` ${req.body.listing.location},${req.body.listing.country}`,
      limit: 1,
    })
    .send();

  req.body.listing.geometry = response.body.features[0].geometry;
  let updatedListing = await Listing.findByIdAndUpdate(id, {
    ...req.body.listing,
  });

  if (typeof req.file !== "undefined") {
    let url = req.file.path;
    let filename = req.file.filename;
    updatedListing.image = { url, filename };
    await updatedListing.save();
  }
  req.flash("success", "Listing updated!");
  res.redirect(`/listings/${id}`);
};

module.exports.filter = async (req, res, next) => {
  let { id } = req.params;
  let allListings = await Listing.find({ category: { $all: [id] } });
  if (allListings.length != 0) {
    res.locals.success = `Listings Filtered by ${id}!`;
    res.render("listings/index.ejs", { allListings });
  } else {
    req.flash("error", `There is no any Listing for ${id}!`);
    res.redirect("/listings");
  }
};

module.exports.search = async (req, res) => {
  let input = req.query.q.trim().replace(/\s+/g, " ");
  if (input == "" || input == " ") {
    req.flash("error", "Please enter search query!");
    res.redirect("/listings");
  }

  let data = input.split("");
  let element = "";
  let flag = false;
  for (let index = 0; index < data.length; index++) {
    if (index == 0 || flag) {
      element = element + data[index].toUpperCase();
    } else {
      element = element + data[index].toLowerCase();
    }
    flag = data[index] == " ";
  }

  let allListings = await Listing.find({
    title: { $regex: element, $options: "i" },
  });
  if (allListings.length != 0) {
    res.locals.success = "Listings searched by Title!";
    res.render("listings/index.ejs", { allListings });
    return;
  }

  if (allListings.length == 0) {
    allListings = await Listing.find({
      category: { $regex: element, $options: "i" },
    }).sort({ _id: -1 });
    if (allListings.length != 0) {
      res.locals.success = "Listings searched by Category!";
      res.render("listings/index.ejs", { allListings });
      return;
    }
  }
  if (allListings.length == 0) {
    allListings = await Listing.find({
      country: { $regex: element, $options: "i" },
    }).sort({ _id: -1 });
    if (allListings.length != 0) {
      res.locals.success = "Listings searched by Country!";
      res.render("listings/index.ejs", { allListings });
      return;
    }
  }

  if (allListings.length == 0) {
    allListings = await Listing.find({
      location: { $regex: element, $options: "i" },
    }).sort({ _id: -1 });
    if (allListings.length != 0) {
      res.locals.success = "Listings searched by Location!";
      res.render("listings/index.ejs", { allListings });
      return;
    }
  }

  const intValue = parseInt(element, 10);
  const intDec = Number.isInteger(intValue);

  if (allListings.length == 0 && intDec) {
    allListings = await Listing.find({ price: { $lte: element } }).sort({
      price: 1,
    });
    if (allListings.length != 0) {
      res.locals.success = `Listings searched by price less than Rs ${element}!`;
      res.render("listings/index.ejs", { allListings });
      return;
    }
  }
  if (allListings.length == 0) {
    req.flash("error", "No listings found based on your search!");
    res.redirect("/listings");
  }
};

module.exports.destroyListing = async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  console.log(deletedListing);
  req.flash("success", "Listing deleted!");
  res.redirect("/listings");
};

// Mail transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Utility function to send email
const sendMail = async (to, subject, text, html) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

// Render the booking form
module.exports.renderBookingForm = async (req, res) => {
  const { id } = req.params;
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/listings");
  }
  res.render("listings/booking.ejs", { listing });
};

// Process the booking request
module.exports.bookListing = async (req, res) => {
  try {
    const listingId = req.params.id; // Get listing ID from the URL parameter
    const listing = await Listing.findById(listingId); // Find the listing by ID

    // Get user email and booking details from the form
    const userEmail = req.body.userEmail; // Get userEmail directly from form submission
    const bookingDetails = req.body.bookingDetails;

    if (!listing) {
      req.flash("error", "Listing not found!");
      return res.redirect("/listings");
    }

    // Prepare booking confirmation email for the user
    const userEmailBody = `
      <html>
        <head>
          <style>
            /* Styles omitted for brevity */
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Booking Confirmation</h1>
            <p>Dear <strong>${userEmail}</strong>,</p>
            <p>Thank you for booking with us! Here are your booking details:</p>
            <p>Your booking for <strong>${
              listing.title
            }</strong> has been confirmed.</p>
            <div class="details">
              <h2>Booking Details:</h2>
              <ul>
                <li><strong>Check-in Date:</strong> ${
                  bookingDetails.checkInDate
                }</li>
                <li><strong>Check-out Date:</strong> ${
                  bookingDetails.checkOutDate
                }</li>
                <li><strong>Number of Guests:</strong> ${
                  bookingDetails.guests
                }</li>
                <li><strong>Phone Number:</strong> ${
                  bookingDetails.phoneNumber
                }</li>
                <li><strong>Payment Method:</strong> ${
                  bookingDetails.paymentMethod === "payAtHotel"
                    ? "Pay at Hotel"
                    : bookingDetails.onlinePaymentOption
                }</li>
                <li><strong>Special Requests:</strong> ${
                  bookingDetails.specialRequests || "None"
                }</li>
              </ul>
              <p>We look forward to welcoming you!</p>
            </div>
            <p>If you have any questions, feel free to <a href="mailto:support@example.com">contact our support team</a>.</p>
          </div>
        </body>
      </html>
    `;

    // Send confirmation email to the user
    await sendMail(
      userEmail,
      `Booking Confirmation - ${listing.title}`,
      `Your booking for ${listing.title} has been confirmed.`,
      userEmailBody
    );

    // Prepare booking notification email for the owner
    const ownerEmailBody = `
      <html>
        <body>
          <p>Dear ${listing.owner.name},</p>
          <p>You have received a new booking for <strong>${
            listing.title
          }</strong>.</p>
          <h2>Booking Details:</h2>
          <ul>
            <li><strong>User Email:</strong> ${userEmail}</li>
            <li><strong>Check-in Date:</strong> ${
              bookingDetails.checkInDate
            }</li>
            <li><strong>Check-out Date:</strong> ${
              bookingDetails.checkOutDate
            }</li>
            <li><strong>Number of Guests:</strong> ${bookingDetails.guests}</li>
            <li><strong>Phone Number:</strong> ${
              bookingDetails.phoneNumber
            }</li>
            <li><strong>Payment Method:</strong> ${
              bookingDetails.paymentMethod === "payAtHotel"
                ? "Pay at Hotel"
                : bookingDetails.onlinePaymentOption
            }</li>
            <li><strong>Special Requests:</strong> ${
              bookingDetails.specialRequests || "None"
            }</li>
          </ul>
          <p>Thank you for using our service!</p>
        </body>
      </html>
    `;

    // Send booking notification email to the listing owner
    await sendMail(
      listing.owner.email,
      `New Booking for - ${listing.title}`,
      `You have a new booking for ${listing.title}.`,
      ownerEmailBody
    );

    // Flash success message and redirect
    req.flash(
      "success",
      "Booking successful! Confirmation email has been sent."
    );
    res.redirect(`/listings/${listingId}`);
  } catch (error) {
    console.error(error);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect("/listings");
  }
};
