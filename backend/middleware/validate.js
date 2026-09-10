import { StatusCodes } from "http-status-codes";

const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessage = error.details.map((detail) => detail.message).join(", ");
    return res.status(StatusCodes.BAD_REQUEST).json({ error: errorMessage });
  }
  next();
};

export default validate;
