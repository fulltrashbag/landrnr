const express = require('express');
const { Op } = require('sequelize')
const bcrypt = require('bcryptjs');

const { restoreUser, requireAuth } = require('../../utils/auth')
const { User, Spot, SpotImage, Review, ReviewImage, Booking } = require('../../db/models');

const { check } = require('express-validator')
const { handleValidationErrors } = require('../../utils/validation')

const router = express.Router();

//!GETS
router.get('/current', requireAuth, async (req, res, next) => {
  const { user } = req;

  const mySpots = await Spot.findAll({
    where: {
      ownerId: user.id
    }
  })

  for (let spot of mySpots) {
    //*ADD PREVIEWIMAGE
    const previewImage = await SpotImage.findOne({
      where: {
        spotId: spot.id,
        preview: true
      }
    })

    if (previewImage) {
      spot.dataValues.previewImage = previewImage.url
    } else {
      spot.dataValues.previewImage = "This preview image may have been removed"
    }
    //*FIND AVGRATING
    const reviews = await Review.count({
      where: {
        spotId: spot.id
      }
    })

    const stars = await Review.sum('stars', {
      where: {
        spotId: spot.id
      }
    })

    if (!reviews) {
      spot.dataValues.avgRating = "This spot has not been rated yet"
    } else {
      let avgRating = (stars / reviews).toFixed(1);
      spot.dataValues.avgRating = avgRating
    }
  }
  res.json({ Spots: mySpots })
})

router.get('/:spotid/reviews', async (req, res, next) => {
  const spotId = req.params.spotid;

  if (isNaN(spotId)) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  const spotToPullReviews = await Spot.findOne({
    where: {
      id: spotId
    }
  })

  if (!spotToPullReviews) {
    res.status(404);
    return res.json({ message: "Spot couldn't be found" })
  }

  const reviews = await Review.findAll({
    where: {
      spotId: spotToPullReviews.id
    },
    include: {
      model: User,
      attributes: ['id', 'firstName', 'lastName']
    }
  })

  for (let review of reviews) {
    const reviewImages = await ReviewImage.findAll({
      where: {
        reviewId: review.id
      },
      attributes: ['id', 'url']
    })
    review.dataValues.ReviewImages = reviewImages;
  }

  res.json({ Reviews: reviews })

})

router.get('/:spotid/bookings', requireAuth, async (req, res, next) => {
  const spotId = req.params.spotid;
  const { user } = req;

  if (isNaN(spotId)) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  //*Check if spot exists
  const spotToCheck = await Spot.findOne({
    where: {
      id: spotId
    }
  })
  //* no spot?
  if (!spotToCheck) {
    res.status(404);
    return res.json({ message: "Spot couldn't be found" })
  }

  //* non-owner of spot?
  if (user.id !== spotToCheck.ownerId) {
    const bookings = await Booking.findAll({
      where: {
        spotId: spotId
      },
      attributes: ['spotId', 'startDate', 'endDate']
    })
    return res.json(bookings)
  }

  if (user.id == spotToCheck.ownerId) {
    const bookings = await Booking.findAll({
      where: {
        spotId: spotId
      },
      include: {
        model: User,
        attributes: ['id', 'firstName', 'lastName']
      }
    })
    return res.json(bookings)
  }

})

router.get('/:spotid', async (req, res, next) => {
  const spotId = req.params.spotid;

  if (isNaN(spotId)) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  const spot = await Spot.findByPk(spotId)

  if (!spot) {
    res.status(404);
    return res.json({ message: "Spot couldn't be found" })
  }

  //*ADD PICS
  const images = await SpotImage.findAll({
    where: {
      spotId: spotId
    },
    attributes: ['id', 'url', 'preview']
  })

  if (!images.length) {
    spot.dataValues.SpotImages = "This spot doesn't have any images yet."
  } else {
    spot.dataValues.SpotImages = images
  }

  //*FIND AVGRATING
  const reviews = await Review.count({
    where: {
      spotId: spot.id
    }
  })

  const stars = await Review.sum('stars', {
    where: {
      spotId: spot.id
    }
  })

  if (!reviews) {
    spot.dataValues.avgRating = "This spot has not been rated yet"
  } else {
    let avgRating = (stars / reviews).toFixed(1);
    spot.dataValues.avgRating = avgRating
  }

  res.json(spot)
})

router.get('/', async (req, res, next) => {

  let { page = 1, size = 20, minLat, maxLat, minLng, maxLng, minPrice, maxPrice } = req.query;

  if (size > 20) size = 20

  const errors = {};

  if (page < 1) errors.page = "Page must be greater than or equal to 1"
  if (size < 1) errors.size = "Size must be greater than or equal to 1"

  if (maxLat) maxLat = Number(maxLat)
  if (minLat) minLat = Number(minLat)
  if (maxLng) maxLng = Number(maxLng)
  if (minLng) minLng = Number(minLng)

  if (maxLat && minLat) {
    if ((maxLat < minLat) || (maxLat < -90 || maxLat > 90)) errors.maxLat = "Maximum latitude is invalid"
    if ((minLat > maxLat) || (minLat < -90 || minLat > 90)) errors.minLat = "Minimum latitude is invalid"
  } else if (maxLat && (maxLat < -90 || maxLat > 90)) errors.maxLat = "Maximum latitude is invalid"
  else if (minLat && (minLat < -90 || minLat > 90)) errors.minLat = "Minimum latitude is invalid"

  if (minLng && maxLng) {
    if ((maxLng < minLng) || (maxLng < -180 || maxLng > 180)) errors.maxLng = "Maximum longitude is invalid"
    if ((minLng > maxLng) || (minLng < -180 || minLng > 180)) errors.minLng = "Minimum longitude is invalid"
  } else if (minLng && (minLng < -180 || minLng > 180)) errors.minLng = "Minimum longitude is invalid"
  else if (maxLng && (maxLng < -180 || maxLng > 180)) errors.maxLng = "Maximum longitude is invalid"

  if (minPrice && minPrice < 0) errors.minPrice = "Minimum price must be greater than or equal to 0"
  if (maxPrice && maxPrice < 0) errors.maxPrice = "Maximum price must be greater than or equal to 0"


  if (Object.keys(errors).length) {
    res.status(400)
    return res.json({
      message: "Bad Request",
      errors: { ...errors }
    })
  }

  const where = {}

  if (minLat && maxLat) {
    where.lat = { [Op.between]: [minLat, maxLat] }
  } else if (minLat) {
    where.lat = { [Op.gte]: minLat }
  } else if (maxLat) {
    where.lat = { [Op.lte]: maxLat }
  }

  if (minLng && maxLng) {
    where.lng = { [Op.between]: [minLng, maxLat] }
  } else if (minLng) {
    where.lng = { [Op.gte]: minLng }
  } else if (maxLng) {
    where.lng = { [Op.lte]: maxLng }
  }

  if (minPrice && maxPrice) {
    where.price = { [Op.between]: [minPrice, maxPrice] }
  } else if (minPrice) {
    where.price = { [Op.gte]: [minPrice] }
  } else if (maxPrice) {
    where.price = { [Op.lte]: [maxPrice] }
  }

  const allSpots = await Spot.findAll({
    where,
    limit: size,
    offset: size * (page - 1),
  });

  for (let spot of allSpots) {
    //* GET PICS
    const previewImage = await SpotImage.findOne({
      where: {
        spotId: spot.id,
        preview: true
      }
    })

    if (previewImage) {
      spot.dataValues.previewImage = previewImage.url
    } else {
      spot.dataValues.previewImage = "This preview image may have been removed"
    }

    //*FIND AVGRATING
    const reviews = await Review.count({
      where: {
        spotId: spot.id
      }
    })

    const stars = await Review.sum('stars', {
      where: {
        spotId: spot.id
      }
    })

    if (!reviews) {
      spot.dataValues.avgRating = "This spot has not been rated yet"
    } else {
      let avgRating = (stars / reviews).toFixed(1);
      spot.dataValues.avgRating = avgRating
    }

  }

  res.json({Spots: {...allSpots,
    page: page,
    size: size}})
})

//!POSTS
router.post('/:spotid/bookings', requireAuth, async (req, res, next) => {
  const { user } = req;
  const spotId = req.params.spotid;
  const { startDate, endDate } = req.body;

  if (isNaN(spotId)) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  const formattedStartDate = new Date(startDate).getTime();
  const formattedEndDate = new Date(endDate).getTime();

  const spotToBook = await Spot.findByPk(spotId);

  //*if query returns null from params
  if (!spotToBook) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  //* if you're trying to book your own spot
  if (user.id == spotToBook.ownerId) {
    res.status(403);
    return res.json({
      message: 'Forbidden'
    })
  }

  //* if requested end date is a paradox
  if (formattedEndDate <= formattedStartDate) {
    res.status(400);
    return res.json({
      message: "Bad Request",
      errors: {
        endDate: 'endDate cannot be on or before startDate'
      }
    })
  }

  //*find current bookings to compare request against
  const currentBookings = await Booking.findAll({
    where: {
      spotId: spotId
    }
  })

  //* to collect errors re: booking conflicts
  let errors = {}

  //*loop through current bookings
  for (let booking of currentBookings) {
    const existingBookingStart = new Date(booking.startDate).getTime();
    const existingBookingEnd = new Date(booking.endDate).getTime();

    //* new start date is in between an existing booking
    if (existingBookingStart <= formattedStartDate && formattedStartDate <= existingBookingEnd) {
      errors.startDate = "Start date conflicts with an existing booking"
    }

    //* new end date is in between an existing booking
    if (existingBookingStart <= formattedEndDate && formattedEndDate <= existingBookingEnd) {
      errors.endDate = "End date conflicts with an existing booking"
    }

    //* new booking encapsulates an existing booking
    if (existingBookingStart > formattedStartDate && existingBookingEnd < formattedEndDate) {
      errors.startDate = "Start date conflicts with an existing booking";
      errors.endDate = "End date conflicts with an existing booking";
    }
  }
  //!LOOP END

  //* Did we get any errors? spread them into the way the docs say
  if (Object.keys(errors).length) { //!empty object still truthy, check length of keys collected
    res.status(403);
    return res.json({
      message: "Sorry, this spot is already booked for the specified dates",
      errors: { ...errors }
    })
  }

  const validBooking = await spotToBook.createBooking({
    userId: user.id,
    startDate,
    endDate
  })

  res.json(validBooking)

})

router.post('/:spotid/images', requireAuth, async (req, res, next) => {
  const { user } = req;
  const { url, preview } = req.body;
  const spotId = req.params.spotid

  if (isNaN(spotId)) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  const spotToAddImage = await Spot.findByPk(spotId)
  //* check if spot exists
  if (!spotToAddImage) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }
  //* check if non-owner
  if (spotToAddImage.ownerId != user.id) {
    res.status(403);
    return res.json({
      message: "Forbidden"
    })
  }
  //* make that image if we make it here
  const newSpotImage = await spotToAddImage.createSpotImage({
    url,
    preview
  })
  //* return the image
  res.json({
    id: newSpotImage.id,
    url: newSpotImage.url,
    preview: newSpotImage.preview
  })
})

router.post('/:spotid/reviews', requireAuth, async (req, res, next) => {
  const spotId = req.params.spotid;
  const { review, stars } = req.body;
  const { user } = req;

  if (isNaN(spotId)) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  const spotToReview = await Spot.findByPk(spotId);

  if (!spotToReview) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  const existingReviewsOfSpot = await Review.findAll({
    where: {
      spotId: spotToReview.id
    }
  })

  for (let review of existingReviewsOfSpot) {
    if (review.userId == user.id) {
      res.status(500);
      return res.json({
        message: "User already has a review for this spot"
      })
    }
  }

  const errors = {}
  if (!review) errors.review = "Review text is required"
  if (!stars || stars < 1 || stars > 5) errors.stars = "Stars must be an integer from 1 to 5"
  if (Object.keys(errors).length) {
    return res.status(400).json({
      message: "Bad Request",
      errors: { ...errors }
    })
  }

  const newReview = await Review.create({
    userId: user.id,
    spotId: spotId,
    review: review,
    stars: stars
  })


  res.json(newReview)
})

router.post('/', requireAuth, async (req, res, next) => {

  const { address, city, state, country, lat, lng, name, description, price } = req.body
  const { user } = req;

  let errors = {}

  if (!address) {
    errors.address = "Street address is required"
  }
  if (!city) {
    errors.city = "City is required"
  }
  if (!state) {
    errors.state = "State is required"
  }
  if (!country) {
    errors.country = "Country is required"
  }
  if (lat < -90 || lat > 90) {
    errors.lat = "Latitude is not valid"
  }
  if (lng < -180 || lng > 180) {
    errors.lng = "Longitude is not valid"
  };
  if (!name || name.length > 50 || name.length < 0) {
    errors.name = "Name must be less than 50 characters"
  };
  if (!description) {
    errors.description = "Description is required"
  };
  if (!price || price < 1) {
    errors.price = "Price per day is required"
  };

  if (Object.keys(errors).length) {
    return res.status(400).json({
      message: "Bad Request",
      errors: { ...errors }
    })
  };

  const spot = await Spot.create({
    ownerId: user.id,
    address, city, state, country, lat, lng, name, description, price
  });


  res.status(201);
  res.json(spot);

})


//!PUT
router.put('/:spotid', requireAuth, async (req, res, next) => {
  const { address, city, state, country, lat, lng, name, description, price } = req.body
  const { user } = req;
  const spotId = req.params.spotid

  if (isNaN(spotId)) {
    res.status(404);
    return res.json({ message: "Spot couldn't be found" })
  }

  let errors = {}

  if (!address) {
    errors.address = "Street address is required"
  }
  if (!city) {
    errors.city = "City is required"
  }
  if (!state) {
    errors.state = "State is required"
  }
  if (!country) {
    errors.country = "Country is required"
  }
  if (lat < -90 || lat > 90) {
    errors.lat = "Latitude is not valid"
  }
  if (lng < -180 || lng > 180) {
    errors.lng = "Longitude is not valid"
  };
  if (!name || name.length > 50 || name.length < 0) {
    errors.name = "Name must be less than 50 characters"
  };
  if (!description) {
    errors.description = "Description is required"
  };
  if (!price || price < 1) {
    errors.price = "Price per day is required"
  };

  if (Object.keys(errors).length) {
    return res.status(400).json({
      message: "Bad Request",
      errors: { ...errors }
    })
  };

  const spotToEdit = await Spot.findByPk(spotId)

  if (!spotToEdit) {
    res.status(404);
    return res.json({ message: "Spot couldn't be found" })
  }

  if (spotToEdit.ownerId != user.id) {
    res.status(403);
    return res.json({ message: "Forbidden" })
  }

  await spotToEdit.set({
    address, city, state, country, lat, lng, name, description, price
  });

  await spotToEdit.save()

  res.status(200);
  res.json(spotToEdit);
})

//!DELETE
router.delete('/:spotid', requireAuth, async (req, res, next) => {
  const spotId = req.params.spotid;
  const { user } = req

  if (isNaN(spotId)) {
    res.status(404);
    res.json({
      message: "Spot couldn't be found"
    })
  }

  const spotToDelete = await Spot.findByPk(spotId)

  if (!spotToDelete) {
    res.status(404);
    return res.json({
      message: "Spot couldn't be found"
    })
  }

  if (spotToDelete.ownerId !== user.id) {
    res.status(403);
    return res.json({ message: "Forbidden" })
  }


  await spotToDelete.destroy()
  res.json({
    message: "Successfully deleted"
  })
})


module.exports = router
