'use strict';

const { User } = require('../models');
const bcrypt = require("bcryptjs");

let options = {};
if (process.env.NODE_ENV === 'production') {
  options.schema = process.env.SCHEMA;  // define your schema in options object
}

module.exports = {
  async up (queryInterface, Sequelize) {
    options.validate = "true"
    await User.bulkCreate([
      { id: 1,
        email: 'demo@user.io',
        username: 'Demo-lition',
        firstName: 'Demo',
        lastName: 'Lition',
        hashedPassword: bcrypt.hashSync('password')
      },
      {
        id: 2,
        email: 'user1@user.io',
        username: 'FakeUser1',
        firstName: 'Fake',
        lastName: 'User',
        hashedPassword: bcrypt.hashSync('password2')
      },
      { id: 3,
        email: 'user2@user.io',
        username: 'FakeUser2',
        firstName: 'Brake',
        lastName: "Fuser",
        hashedPassword: bcrypt.hashSync('password3')
      }
    ], options);
  },

  async down (queryInterface, Sequelize) {
    options.tableName = 'Users';
    const Op = Sequelize.Op;
    return queryInterface.bulkDelete(options, {
      username: { [Op.in]: ['Demo-lition', 'FakeUser1', 'FakeUser2'] }
    }, {});
  }
};
